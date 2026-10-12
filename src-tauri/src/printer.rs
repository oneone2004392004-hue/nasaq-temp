use serde::{Deserialize, Serialize};
use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct WindowsPrinterInfo {
    pub name: String,
    pub is_default: bool,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrintResult {
    pub success: bool,
    pub bytes_sent: usize,
    pub message: String,
    pub error_code: Option<String>,
}

/// Print raw bytes to a Windows printer using Windows Spooler API (winspool.drv)
#[cfg(windows)]
pub fn print_spooler_raw(printer_name: &str, data: &[u8]) -> Result<PrintResult, String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Graphics::Printing::*;

    let wide_name: Vec<u16> = OsStr::new(printer_name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut h_printer: HANDLE = 0;
    let open_res = unsafe { OpenPrinterW(wide_name.as_ptr() as *mut u16, &mut h_printer, std::ptr::null_mut()) };
    if open_res == 0 || h_printer == 0 {
        return Err(format!("فشل فتح الطابعة '{}': تعذر الوصول إلى محرك الطباعة المحلي", printer_name));
    }

    let doc_name: Vec<u16> = OsStr::new("NASAQ POS Receipt")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let data_type: Vec<u16> = OsStr::new("RAW")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let doc_info = DOC_INFO_1W {
        pDocName: doc_name.as_ptr() as *mut u16,
        pOutputFile: std::ptr::null_mut(),
        pDatatype: data_type.as_ptr() as *mut u16,
    };

    let job_id = unsafe { StartDocPrinterW(h_printer, 1, &doc_info) };
    if job_id == 0 {
        unsafe { ClosePrinter(h_printer) };
        return Err(format!("فشل بدء مهمة الطباعة على الطابعة '{}'", printer_name));
    }

    let start_page = unsafe { StartPagePrinter(h_printer) };
    if start_page == 0 {
        unsafe {
            EndDocPrinter(h_printer);
            ClosePrinter(h_printer);
        }
        return Err("فشل بدء صفحة الطباعة".to_string());
    }

    let mut bytes_written: u32 = 0;
    let write_res = unsafe {
        WritePrinter(
            h_printer,
            data.as_ptr() as *const std::ffi::c_void,
            data.len() as u32,
            &mut bytes_written,
        )
    };

    unsafe {
        EndPagePrinter(h_printer);
        EndDocPrinter(h_printer);
        ClosePrinter(h_printer);
    }

    if write_res == 0 || bytes_written as usize != data.len() {
        return Err(format!("فشل إرسال البيانات المباشرة إلى الطابعة '{}'", printer_name));
    }

    Ok(PrintResult {
        success: true,
        bytes_sent: bytes_written as usize,
        message: "تم إرسال أمر الطباعة بنجاح إلى منفذ الطابعة".to_string(),
        error_code: None,
    })
}

#[cfg(not(windows))]
pub fn print_spooler_raw(printer_name: &str, data: &[u8]) -> Result<PrintResult, String> {
    // Non-Windows environment (e.g. Linux development or container preview)
    Ok(PrintResult {
        success: true,
        bytes_sent: data.len(),
        message: format!("محاكاة إرسال الطباعة إلى '{}' (بيئة غير ويندوز)", printer_name),
        error_code: None,
    })
}

/// Print raw bytes to a network thermal printer using direct TCP socket (port 9100)
pub fn print_network_raw(ip: &str, port: u16, timeout_ms: u64, data: &[u8]) -> Result<PrintResult, String> {
    let addr_str = format!("{}:{}", ip, port);
    let socket_addr: SocketAddr = addr_str
        .parse()
        .map_err(|e| format!("عنوان IP غير صالح للطابعة الشبكية '{}': {}", addr_str, e))?;

    let timeout = Duration::from_millis(timeout_ms);

    let mut stream = TcpStream::connect_timeout(&socket_addr, timeout)
        .map_err(|e| format!("تعذر الاتصال بالطابعة الشبكية عند '{}': {}", addr_str, e))?;

    stream
        .set_write_timeout(Some(timeout))
        .map_err(|e| format!("فشل تعيين مهلة الكتابة: {}", e))?;

    let mut written = 0usize;
    while written < data.len() {
        let count = stream.write(&data[written..])
            .map_err(|e| format!("فشل إرسال بايتات ESC/POS إلى الطابعة الشبكية: {}", e))?;
        if count == 0 { return Err("لم تستقبل الطابعة أي بايتات من البيانات".to_string()); }
        written += count;
    }

    stream
        .flush()
        .map_err(|e| format!("فشل تفريغ قناة الطباعة: {}", e))?;

    Ok(PrintResult {
        success: true,
        bytes_sent: written,
        message: format!("تم إرسال أمر الطباعة بنجاح إلى الطابعة الشبكية {}", addr_str),
        error_code: None,
    })
}

/// Enumerate installed Windows printers
#[cfg(windows)]
pub fn enumerate_windows_printers() -> Result<Vec<WindowsPrinterInfo>, String> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Graphics::Printing::*;

    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut bytes_needed: u32 = 0;
    let mut printers_count: u32 = 0;

    unsafe {
        EnumPrintersW(
            flags,
            std::ptr::null_mut(),
            2,
            std::ptr::null_mut(),
            0,
            &mut bytes_needed,
            &mut printers_count,
        );
    }

    if bytes_needed == 0 {
        return Ok(Vec::new());
    }

    let mut buffer: Vec<u8> = vec![0; bytes_needed as usize];
    let res = unsafe {
        EnumPrintersW(
            flags,
            std::ptr::null_mut(),
            2,
            buffer.as_mut_ptr(),
            bytes_needed,
            &mut bytes_needed,
            &mut printers_count,
        )
    };

    if res == 0 {
        return Err("تعذر استرداد قائمة الطابعات المثبتة في نظام ويندوز".to_string());
    }

    let mut list = Vec::new();
    let printer_infos = buffer.as_ptr() as *const PRINTER_INFO_2W;

    for i in 0..printers_count {
        let info = unsafe { &*printer_infos.add(i as usize) };
        if !info.pPrinterName.is_null() {
            let mut len = 0;
            while unsafe { *info.pPrinterName.add(len) } != 0 {
                len += 1;
            }
            let wide_slice = unsafe { std::slice::from_raw_parts(info.pPrinterName, len) };
            let name = OsString::from_wide(wide_slice).to_string_lossy().into_owned();

            list.push(WindowsPrinterInfo {
                name,
                is_default: (info.Attributes & PRINTER_ATTRIBUTE_DEFAULT) != 0,
                status: "ONLINE".to_string(),
            });
        }
    }

    Ok(list)
}

#[cfg(not(windows))]
pub fn enumerate_windows_printers() -> Result<Vec<WindowsPrinterInfo>, String> {
    Ok(vec![
        WindowsPrinterInfo {
            name: "POS-80 (Default Windows Thermal Printer)".to_string(),
            is_default: true,
            status: "ONLINE".to_string(),
        },
        WindowsPrinterInfo {
            name: "Kitchen-Printer-58".to_string(),
            is_default: false,
            status: "ONLINE".to_string(),
        },
    ])
}
