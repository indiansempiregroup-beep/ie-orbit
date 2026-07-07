import type { RegisterWizardStepId } from '../../../config/onboarding';
import { REGISTER_WIZARD_STEPS } from '../../../config/onboarding';

type WizardStepperProps = {
  currentStep: RegisterWizardStepId;
};

export function WizardStepper({ currentStep }: WizardStepperProps) {
  const currentIndex = REGISTER_WIZARD_STEPS.findIndex((step) => step.id === currentStep);

  return (
    <nav aria-label="Registration progress" className="wizard-stepper">
      <ol className="wizard-stepper-list">
        {REGISTER_WIZARD_STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = step.id === currentStep;
          return (
            <li
              key={step.id}
              className={`wizard-stepper-item${isCurrent ? ' is-current' : ''}${isComplete ? ' is-complete' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="wizard-stepper-index" aria-hidden="true">
                {index + 1}
              </span>
              <span className="wizard-stepper-label">{step.label}</span>
            </li>
          );
        })}
      </ol>
      <div
        className="wizard-stepper-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={REGISTER_WIZARD_STEPS.length}
        aria-valuenow={currentIndex + 1}
        aria-label={`Step ${currentIndex + 1} of ${REGISTER_WIZARD_STEPS.length}`}
      >
        <span style={{ width: `${((currentIndex + 1) / REGISTER_WIZARD_STEPS.length) * 100}%` }} />
      </div>
    </nav>
  );
}
