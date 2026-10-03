import type { CSSProperties } from 'react';
import type { RegisterWizardStepId } from '../../../config/onboarding';
import { REGISTER_WIZARD_VISIBLE_STEPS } from '../../../config/onboarding';

type WizardStepperProps = {
  currentStep: RegisterWizardStepId;
};

export function WizardStepper({ currentStep }: WizardStepperProps) {
  const displayStep = currentStep === 'provision' ? 'review' : currentStep;
  const currentIndex = REGISTER_WIZARD_VISIBLE_STEPS.findIndex((step) => step.id === displayStep);
  const stepCount = REGISTER_WIZARD_VISIBLE_STEPS.length;
  const progressIndex = currentStep === 'provision' ? stepCount : currentIndex + 1;

  return (
    <nav aria-label="Registration progress" className="wizard-stepper">
      <ol className="wizard-stepper-list">
        {REGISTER_WIZARD_VISIBLE_STEPS.map((step, index) => {
          const isComplete = index < currentIndex || currentStep === 'provision';
          const isCurrent = step.id === displayStep && currentStep !== 'provision';
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
        aria-valuemax={stepCount}
        aria-valuenow={progressIndex}
        aria-label={`Step ${progressIndex} of ${stepCount}`}
        style={
          {
            '--wizard-progress': `${(progressIndex / stepCount) * 100}%`,
          } as CSSProperties
        }
      >
        <span />
      </div>
    </nav>
  );
}
