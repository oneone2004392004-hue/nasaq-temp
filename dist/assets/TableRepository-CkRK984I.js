import{f as s,V as n}from"./index-DTwrYXZa.js";class r extends s{constructor(t){super("tables",t)}withTransaction(t){return new r(t)}async findByName(t){return await this.executor.queryOne("SELECT * FROM tables WHERE name = ?;",[t.trim()])}async listAll(t=!1){return t?await this.executor.query("SELECT * FROM tables WHERE is_active = 1 ORDER BY name ASC;"):await this.executor.query("SELECT * FROM tables ORDER BY name ASC;")}async listAvailable(){return await this.executor.query(`SELECT t.* 
       FROM tables t
       WHERE t.is_active = 1 
         AND t.status = 'AVAILABLE'
         AND NOT EXISTS (
           SELECT 1 FROM orders o 
           WHERE (o.table_id = t.id OR o.table_number = t.name) 
             AND o.status IN ('PENDING', 'HOLD')
         )
       ORDER BY t.name ASC;`)}async updateStatus(t,e){const a=new Date().toISOString();return await this.update(t,{status:e,updated_at:a})}async activate(t){const e=new Date().toISOString();return(await this.executor.run("UPDATE tables SET is_active = 1, updated_at = ? WHERE id = ?;",[e,t])).rowsAffected>0}async getOccupyingOrder(t){return await this.executor.queryOne(`SELECT * FROM orders 
       WHERE (table_id = ? OR table_number = ?) 
         AND status IN ('PENDING', 'HOLD') 
       ORDER BY created_at DESC 
       LIMIT 1;`,[t,t])}async safeDelete(t){const e=await this.findById(t);if(!e)return!1;const a=await this.executor.queryOne("SELECT COUNT(*) as count FROM orders WHERE table_id = ? OR table_number = ?;",[t,e.name]);if(a&&a.count>0)throw new n(`لا يمكن حذف الطاولة (${e.name}) لوجود ${a.count} طلب مرتبط بها في السجلات التاريخية. يرجى تعطيلها بدلاً من الحذف.`);return await this.delete(t)}}export{r as T};
