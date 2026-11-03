import {isActiveProfile} from "./permissions.ts";

type AuthError = {status?: number; name?: string; code?: string};
export async function sessionAccess(source: {
 user: () => Promise<{data: {user: {id:string}|null}; error:AuthError|null}>;
 profile: (id:string) => Promise<{data:unknown; error:unknown}>;
}) {
 const {data,error}=await source.user();
 if(error){
  if(error.name==="AuthSessionMissingError"||error.status===401||error.status===403||["session_not_found","user_not_found","refresh_token_not_found","bad_jwt"].includes(error.code??""))return {status:401 as const};
  return {status:503 as const};
 }
 if(!data.user)return {status:401 as const};
 const profile=await source.profile(data.user.id);
 if(profile.error)return {status:503 as const};
 if(!isActiveProfile(profile.data))return {status:401 as const};
 return {status:200 as const,userId:data.user.id,role:profile.data.role};
}
