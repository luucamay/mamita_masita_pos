import {qaOrderSnapshot,qaOrderCatalog}from"./qa-order-fixture";
import type{EmployeePurchase}from"./employee-purchases";
import type{MenuItem,Category}from"./types";
export const qaPurchaseBuyer="00000000-0000-4000-8000-000000007001";
export function qaEmployeePurchase():EmployeePurchase{
 const snapshot=qaOrderSnapshot();
 return{order:{...snapshot.order,order_number:"EMP-00000000-0000-4000-8000-000000007001",id:"00000000-0000-4000-8000-000000007001",table_number:"Empleado",customer_name:"Empleado QA",status:"pendiente",purchase_type:"employee",buyer_employee_id:qaPurchaseBuyer,buyer_name:"Empleado QA",buyer_active:true,discount_bps:2000,discount_amount:11.8,subtotal:59,total:47.2,employee_cancelled_at:null},items:snapshot.items.map((item,index)=>({...item,discount_amount:index?9.8:2,net_total:index?39.2:8}))};
}
export const qaPurchaseCategories:Category[]=[{id:"qa-cafe",name:"Café QA",slug:"qa-cafe",queue_type:"cafe",sort_order:0,active:true}];
export const qaPurchaseMenu:MenuItem[]=qaOrderCatalog.map(product=>({...product,category_id:"qa-cafe",active:true,sort_order:0,categories:{id:"qa-cafe",name:"Café QA",slug:"qa-cafe",queue_type:"cafe"}}));
