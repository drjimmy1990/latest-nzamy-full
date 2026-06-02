import { redirect } from 'next/navigation';

// /precedents redirects to the legal library (laws page)
// which already has a full precedents & judicial principles section
export default function PrecedentsRedirect() {
  redirect('/laws?tab=precedents');
}