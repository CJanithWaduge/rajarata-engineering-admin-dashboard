import { useId } from 'react'
import type { ComponentPropsWithRef, ReactNode } from 'react'

export interface CheckboxProps extends ComponentPropsWithRef<'input'> {
  label: ReactNode
  hint?: string
}

/**
 * Labelled checkbox used for boolean settings.
 *
 * The hint sits outside the <label> so it is announced through
 * `aria-describedby` instead of being folded into the control's name.
 */
export function Checkbox({
  label,
  hint,
  id,
  className = '',
  ...rest
}: CheckboxProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`

  return (
    <div className="flex items-start gap-3">
      <input
        id={inputId}
        type="checkbox"
        aria-describedby={hint ? hintId : undefined}
        className={[
          'mt-0.5 h-5 w-5 shrink-0 rounded-chip border-[1.5px] border-outline-variant accent-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
          className,
        ].join(' ')}
        {...rest}
      />
      <div className="flex flex-col gap-1">
        <label
          htmlFor={inputId}
          className="cursor-pointer font-label-sm text-label-sm font-semibold text-on-surface"
        >
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="font-body-sm text-body-sm text-secondary">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}
