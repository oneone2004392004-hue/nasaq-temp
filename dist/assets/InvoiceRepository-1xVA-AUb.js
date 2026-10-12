import{f as c}from"./index-DTwrYXZa.js";class u extends c{constructor(e){super("payments",e)}withTransaction(e){return new u(e)}async listByOrderId(e){return await this.executor.query("SELECT * FROM payments WHERE order_id = ? ORDER BY created_at ASC;",[e])}async listByShiftId(e){return await this.executor.query("SELECT * FROM payments WHERE shift_id = ? ORDER BY created_at DESC;",[e])}async getShiftPaymentTotals(e){const n=await this.executor.query(`SELECT payment_method, SUM(amount) AS total
       FROM payments
       WHERE shift_id = ?
       GROUP BY payment_method;`,[e]);let o=0,r=0;for(const s of n)s.payment_method==="CASH"?o+=s.total:s.payment_method==="CARD"&&(r+=s.total);return{cashTotal:o,cardTotal:r,total:o+r}}async delete(){throw new Error("قيد مالي صارم: لا يمكن حذف سجل دفع مالي من قاعدة البيانات نهائياً. استخدم قيود التسوية أو المرتجعات.")}}class d extends c{constructor(e){super("invoices",e)}withTransaction(e){return new d(e)}async findByInvoiceNumber(e){return await this.executor.queryOne("SELECT * FROM invoices WHERE invoice_number = ?;",[e])}async findByOrderId(e){return await this.executor.queryOne("SELECT * FROM invoices WHERE order_id = ?;",[e])}async listByShift(e){return await this.executor.query("SELECT * FROM invoices WHERE shift_id = ? ORDER BY created_at DESC;",[e])}async getNextInvoiceNumber(){const e=await this.executor.queryOne("SELECT invoice_number FROM invoices WHERE invoice_number GLOB '[0-9]*' ORDER BY CAST(invoice_number AS INTEGER) DESC LIMIT 1;"),n=e!=null&&e.invoice_number&&/^\d+$/.test(e.invoice_number)?Number(e.invoice_number)+1:1;return String(n)}async listInvoices(e){let n=`
      SELECT 
        inv.id,
        inv.invoice_number,
        inv.order_id,
        o.order_number,
        o.order_type,
        o.table_number,
        COALESCE(inv.customer_name_snapshot, c.name) AS customer_name,
        inv.cashier_name_snapshot AS cashier_name,
        inv.status,
        inv.total_amount,
        inv.tax_amount,
        inv.discount_amount,
        inv.net_amount,
        inv.printed_count,
        inv.created_at,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = inv.order_id) AS items_count,
        (SELECT GROUP_CONCAT(DISTINCT p.payment_method) FROM payments p WHERE p.order_id = inv.order_id) AS raw_payment_methods
      FROM invoices inv
      JOIN orders o ON inv.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1=1
    `;const o=[];if(e!=null&&e.status&&e.status!=="ALL"&&(n+=" AND inv.status = ?",o.push(e.status)),e!=null&&e.shiftId&&(n+=" AND inv.shift_id = ?",o.push(e.shiftId)),e!=null&&e.datePreset&&e.datePreset!=="ALL"){const t=new Date;if(e.datePreset==="TODAY"){const a=new Date(t.getFullYear(),t.getMonth(),t.getDate()).toISOString();n+=" AND inv.created_at >= ?",o.push(a)}else if(e.datePreset==="YESTERDAY"){const a=new Date(t.getFullYear(),t.getMonth(),t.getDate()-1).toISOString(),i=new Date(t.getFullYear(),t.getMonth(),t.getDate()).toISOString();n+=" AND inv.created_at >= ? AND inv.created_at < ?",o.push(a,i)}else if(e.datePreset==="THIS_WEEK"){const a=t.getDay(),i=new Date(t.getFullYear(),t.getMonth(),t.getDate()-a).toISOString();n+=" AND inv.created_at >= ?",o.push(i)}else if(e.datePreset==="THIS_MONTH"){const a=new Date(t.getFullYear(),t.getMonth(),1).toISOString();n+=" AND inv.created_at >= ?",o.push(a)}}if(e!=null&&e.startDate&&(n+=" AND inv.created_at >= ?",o.push(e.startDate)),e!=null&&e.endDate&&(n+=" AND inv.created_at <= ?",o.push(e.endDate)),e!=null&&e.search&&e.search.trim()){const t=e.search.trim();if(/^\d+$/.test(t))n+=" AND inv.invoice_number = ?",o.push(t);else{const a=`%${t}%`;n+=" AND (inv.invoice_number LIKE ? OR o.order_number LIKE ? OR o.table_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR inv.cashier_name_snapshot LIKE ?)",o.push(a,a,a,a,a,a)}}n+=" ORDER BY inv.created_at DESC;";const r=await this.executor.query(n,o),s=[];for(const t of r){const a=t.raw_payment_methods?t.raw_payment_methods.split(",").filter(Boolean):[];if(e!=null&&e.paymentMethod&&e.paymentMethod!=="ALL"){if(e.paymentMethod==="SPLIT"){if(a.length<=1)continue}else if(!a.includes(e.paymentMethod))continue}s.push({id:t.id,invoice_number:t.invoice_number,order_id:t.order_id,order_number:t.order_number,order_type:t.order_type,table_number:t.table_number,customer_name:t.customer_name,cashier_name:t.cashier_name,status:t.status,total_amount:t.total_amount,tax_amount:t.tax_amount,discount_amount:t.discount_amount,net_amount:t.net_amount,payment_methods:a,items_count:t.items_count||0,printed_count:t.printed_count||0,created_at:t.created_at})}return s}async incrementPrintCount(e){await this.executor.execute(`UPDATE invoices
       SET printed_count = printed_count + 1, last_printed_at = ?
       WHERE id = ?;`,[new Date().toISOString(),e])}async updateStatus(e,n){return await this.update(e,{status:n})}async delete(e){throw new Error("قيد مالي صارم: لا يمكن حذف فاتورة ضريبية أو مالية من قاعدة البيانات نهائياً. استخدم المرتجع المالي لإلغاء الأثر.")}}export{d as I,u as P};
