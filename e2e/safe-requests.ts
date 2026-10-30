// The new cashbox RPCs below are reads despite using PostgREST's POST transport.
export function isReadOnlyTestRequest(request:{method():string;url():string}){
 return ["GET","HEAD"].includes(request.method()) || ["get_cashbox_context","list_cashbox_shifts","get_order_pricing_context"].some(name=>new URL(request.url()).pathname.endsWith("/rpc/"+name));
}
