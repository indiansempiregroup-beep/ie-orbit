import { Navigate } from 'react-router-dom';
import { VERIFY_EMAIL_PATH } from '../../utils/roles';

export function OnboardingSuccess() {
  return <Navigate to={VERIFY_EMAIL_PATH} replace state={{ fromOnboarding: true }} />;
}

export default OnboardingSuccess;
