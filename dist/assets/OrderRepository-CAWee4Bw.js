import{f as O,t as m,o as n,s as E}from"./index-DTwrYXZa.js";class _ extends O{constructor(e){super("orders",e)}withTransaction(e){return new _(e)}async findByOrderNumber(e){return await this.executor.queryOne("SELECT * FROM orders WHERE order_number = ?;",[e])}async listByShift(e){return await this.executor.query("SELECT * FROM orders WHERE shift_id = ? ORDER BY created_at DESC;",[e])}async listByStatus(e){return await this.executor.query("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC;",[e])}async listPendingDineInTables(){return await this.executor.query(`SELECT table_number, table_id, id AS order_id, total
       FROM orders
       WHERE order_type = 'DINE_IN' AND status IN ('PENDING', 'HOLD') AND (table_number IS NOT NULL OR table_id IS NOT NULL)
       ORDER BY table_number ASC;`)}async findOccupiedTable(e,t){let r=`SELECT table_number, table_id, id AS order_id, total
               FROM orders
               WHERE order_type = 'DINE_IN' AND status IN ('PENDING', 'HOLD') AND (table_number = ? OR table_id = ?)`;const a=[e,e];return t&&(r+=" AND id != ?",a.push(t)),r+=" LIMIT 1;",await this.executor.queryOne(r,a)}async getOrderWithDetailsById(e){return await this.executor.queryOne(`SELECT 
        o.*,
        COALESCE(u.name, 'غير محدد') AS cashier_name,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.address AS customer_address,
        dd.name AS delivery_driver_name,
        dd.phone AS delivery_driver_phone,
        COALESCE((SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id), 0) AS items_count
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN delivery_drivers dd ON o.delivery_driver_id = dd.id
      WHERE o.id = ?;`,[e])}async listWithDetails(e={}){let t=`
      SELECT 
        o.*,
        COALESCE(u.name, 'غير محدد') AS cashier_name,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.address AS customer_address,
        dd.name AS delivery_driver_name,
        dd.phone AS delivery_driver_phone,
        COALESCE((SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id), 0) AS items_count
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN delivery_drivers dd ON o.delivery_driver_id = dd.id
      WHERE 1=1
    `;const r=[];if(e.status&&e.status!=="ALL"&&(t+=" AND o.status = ?",r.push(e.status)),e.orderType&&e.orderType!=="ALL"&&(t+=" AND o.order_type = ?",r.push(e.orderType)),e.userId&&e.userId!=="ALL"&&(t+=" AND o.user_id = ?",r.push(e.userId)),e.search&&e.search.trim()){const a=`%${e.search.trim()}%`;t+=" AND (o.order_number LIKE ? OR o.table_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR dd.name LIKE ?)",r.push(a,a,a,a,a)}if(e.datePreset&&e.datePreset!=="ALL"){const a=e.referenceDate||new Date().toISOString(),o=m(a);if(e.datePreset==="TODAY"){const s=n(o);t+=" AND o.created_at >= ? AND o.created_at <= ?",r.push(s.startIso,s.endIso)}else if(e.datePreset==="YESTERDAY"){const s=n(E(o,-1));t+=" AND o.created_at >= ? AND o.created_at <= ?",r.push(s.startIso,s.endIso)}else if(e.datePreset==="THIS_WEEK"){const s=n(E(o,-6)),d=n(o);t+=" AND o.created_at >= ? AND o.created_at <= ?",r.push(s.startIso,d.endIso)}else if(e.datePreset==="CUSTOM"&&e.customDate){const s=n(e.customDate);t+=" AND o.created_at >= ? AND o.created_at <= ?",r.push(s.startIso,s.endIso)}}return t+=" ORDER BY o.created_at DESC",e.limit&&(t+=" LIMIT ?",r.push(e.limit),e.offset&&(t+=" OFFSET ?",r.push(e.offset))),await this.executor.query(t,r)}async getNextOrderNumber(){const e=new Date,t=e.getFullYear(),r=String(e.getMonth()+1).padStart(2,"0"),a=String(e.getDate()).padStart(2,"0"),o=`${t}${r}${a}`,s=`ORD-${o}-%`,d=await this.executor.queryOne("SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1;",[s]);let u=1;if(d&&d.order_number){const c=d.order_number.split("-");if(c.length===3){const i=parseInt(c[2],10);!isNaN(i)&&i>=1&&(u=i+1)}}return`ORD-${o}-${String(u).padStart(4,"0")}`}async updateStatus(e,t){return await this.update(e,{status:t,updated_at:new Date().toISOString()})}async delete(e){const t=await this.findById(e);if(!t)return!1;if(t.status==="COMPLETED")throw new Error("قيد مالي صارم: لا يمكن حذف طلب مكتمل من قاعدة البيانات نهائياً. استخدم المرتجع أو الإلغاء الإداري.");return super.delete(e)}}export{_ as O};
