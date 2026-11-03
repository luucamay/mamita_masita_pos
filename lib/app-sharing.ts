function safeOrigin(value:string){
 try{const url=new URL(value.includes("://")?value:"https://"+value);if(url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname)))return null;if(url.username||url.password)return null;return url.origin;}catch{return null;}
}
export function appLoginLink(configuredOrigin:string|undefined,currentOrigin:string){
 const origin=(configuredOrigin&&safeOrigin(configuredOrigin))||safeOrigin(currentOrigin);
 if(!origin)throw Error("No se pudo obtener el enlace de la aplicación.");
 return origin+"/login";
}
export function appWhatsAppLink(appLink:string){
 const message="Hola, esta es la app de Mamita Masita: "+appLink+"\nÁbrela en tu celular e inicia sesión con tu cuenta. Para instalarla, usa Instalar app o Agregar a pantalla de inicio en el navegador.\nTe entregaré el usuario y la contraseña por separado.";
 return "https://wa.me/?text="+encodeURIComponent(message);
}
