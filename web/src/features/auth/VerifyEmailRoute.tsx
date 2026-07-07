import { useSearchParams } from 'react-router-dom';
import { VerifyEmailPage } from './VerifyEmailPage';

export function VerifyEmailRoute() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? undefined;
  return <VerifyEmailPage token={token} />;
}
