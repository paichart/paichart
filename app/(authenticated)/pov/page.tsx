import { redirect } from 'next/navigation';

// /pov is a duplicate of /pov/list (SideNav's "Projects" target). Redirect
// to consolidate rendering on the canonical route.
export default function POVPage() {
  redirect('/pov/list');
}
