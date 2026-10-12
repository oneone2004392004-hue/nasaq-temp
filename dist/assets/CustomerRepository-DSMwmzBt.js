import{f as o}from"./index-DTwrYXZa.js";class r extends o{constructor(t){super("customers",t)}withTransaction(t){return new r(t)}async findByPhone(t){return await this.executor.queryOne("SELECT * FROM customers WHERE phone = ?;",[t.trim()])}async search(t){const e=`%${t.trim()}%`;return await this.executor.query(`SELECT * FROM customers
       WHERE name LIKE ? OR phone LIKE ?
       ORDER BY name ASC LIMIT 30;`,[e,e])}async getCustomerStats(t){const e=await this.executor.queryOne(`SELECT COUNT(id) AS count, COALESCE(SUM(total), 0) AS total
       FROM orders
       WHERE customer_id = ? AND status = 'COMPLETED';`,[t]);return{ordersCount:(e==null?void 0:e.count)??0,totalSpentMinor:(e==null?void 0:e.total)??0}}}export{r as C};
