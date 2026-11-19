import { useParams } from 'react-router';

/** The operations of one tag of the API reference. */
export default function TagPage() {
  const { tag = '' } = useParams();
  return <h1 className="text-3xl font-bold tracking-tight text-heading">{tag}</h1>;
}
