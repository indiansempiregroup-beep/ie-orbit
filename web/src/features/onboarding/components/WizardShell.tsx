import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/Card';
import { WizardStepper } from './WizardStepper';
import type { RegisterWizardStepId } from '../../../config/onboarding';

type WizardShellProps = {
  title: string;
  subtitle?: string;
  currentStep: RegisterWizardStepId;
  children: ReactNode;
};

export function WizardShell({ title, subtitle, currentStep, children }: WizardShellProps) {
  return (
    <div className="wizard-shell">
      <div className="wizard-shell-inner">
        <Card className="wizard-card">
          <div className="wizard-card-header">
            <Link to="/" className="wizard-brand" aria-label="IE Platform home">
              IE Platform
            </Link>
            <h1>{title}</h1>
            {subtitle ? <p className="wizard-subtitle">{subtitle}</p> : null}
          </div>
          <WizardStepper currentStep={currentStep} />
          <div className="wizard-card-body">{children}</div>
        </Card>
      </div>
    </div>
  );
}
