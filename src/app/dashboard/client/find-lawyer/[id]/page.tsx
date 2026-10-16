import { redirect } from 'next/navigation';

export default async function LawyerProfileRedirect({ params }: { params: Promise<{ id: string }> }) {
  // Next 16: params is a Promise; reading it synchronously redirected to /lawyers/undefined.
  const { id } = await params;
  redirect(`/lawyers/${id}`);
}
