import { redirect } from 'next/navigation';

export default function LawyerProfileRedirect({ params }: { params: { id: string } }) {
  redirect(`/lawyers/${params.id}`);
}
