import { redirect } from 'next/navigation';

// The site is locale-segmented; the bare root sends customers to English.
// Arabic is one click away in the header, and /ar links are shareable.
export default function RootPage() {
  redirect('/en');
}
