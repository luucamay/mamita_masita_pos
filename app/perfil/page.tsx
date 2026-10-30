import{getEmployeePurchaseData}from"@/lib/employee-purchase-data";
import{ProfilePanel}from"@/components/profile/profile-panel";
export default async function MyProfile(){const data=await getEmployeePurchaseData();return <ProfilePanel name={data.access.profile.full_name??""} email={data.access.email} role={data.access.profile.role} history={data.history} historyError={data.loadError}/>;}
