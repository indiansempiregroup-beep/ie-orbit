import { useNavigate } from 'react-router-dom';

export function PublicBackLink() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="public-back-link"
      onClick={() => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/');
      }}
    >
      Back
    </button>
  );
}
