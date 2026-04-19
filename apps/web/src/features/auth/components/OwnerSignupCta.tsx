import { useNavigate } from "react-router-dom";

import { Button } from "../../../components/ui/Button";

export function OwnerSignupCta() {
  const navigate = useNavigate();

  return (
    <div className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate("/signup/owner")}
        aria-label="Create workspace"
        title="Create workspace"
        className="h-10 w-10 rounded-full border-slate-300 bg-white/95 p-0 shadow-sm backdrop-blur"
      >
        <svg
          className="h-5 w-5 text-slate-700"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M3.5 4.75A2.25 2.25 0 015.75 2.5h4.5A2.25 2.25 0 0112.5 4.75v1h1.75A2.25 2.25 0 0116.5 8v7.25a2.25 2.25 0 01-2.25 2.25h-8.5A2.25 2.25 0 013.5 15.25V8a2.25 2.25 0 012.25-2.25H7.5v-1zm1.5 1h6v-1a.75.75 0 00-.75-.75h-4.5a.75.75 0 00-.75.75v1z" />
          <path d="M10 6.5a.75.75 0 01.75.75V9.25H12.75a.75.75 0 010 1.5H10.75v2a.75.75 0 01-1.5 0v-2H7.25a.75.75 0 010-1.5h2V7.25A.75.75 0 0110 6.5z" />
          <path d="M3.5 4.75A2.25 2.25 0 015.75 2.5h4.5A2.25 2.25 0 0112.5 4.75v1h1.75A2.25 2.25 0 0116.5 8v7.25a2.25 2.25 0 01-2.25 2.25h-8.5A2.25 2.25 0 013.5 15.25V8a2.25 2.25 0 012.25-2.25H7.5v-1zm1.5 1h6v-1a.75.75 0 00-.75-.75h-4.5a.75.75 0 00-.75.75v1z" />
        </svg>
      </Button>
    </div>
  );
}
