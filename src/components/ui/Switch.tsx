import { useId } from 'react'
import type { ComponentPropsWithRef, ReactNode } from 'react'

export interface SwitchProps
  extends Omit<ComponentPropsWithRef<'input'>, 'type'> {
  label: ReactNode
  hint?: string
}

/**
 * Pill toggle for boolean settings.
 *
 * A native checkbox keeps keyboard and screen-reader behaviour; the track and
 * knob are drawn with `peer-*` utilities, and `role="switch"` exposes the
 * on/off intent to assistive technology.
 */
export function Switch({
  label,
  hint,
  id,
  className = '',
  checked,
  ...rest
}: SwitchProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`

  return (
    <div className={['inline-flex items-center gap-3', className].join(' ')}>
      <label
        htmlFor={inputId}
        className="cursor-pointer font-label-md text-label-md font-semibold text-on-surface"
      >
        {label}
      </label>
      <span className="relative inline-flex">
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          checked={checked}
          aria-checked={checked}
          aria-describedby={hint ? hintId : undefined}
          className="peer h-8 w-14 shrink-0 cursor-pointer appearance-none rounded-full border-[1.5px] border-outline-variant bg-surface-container-highest transition-colors checked:border-primary-container checked:bg-primary-container focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container disabled:cursor-not-allowed disabled:opacity-40"
          {...rest}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[5px] top-[5px] h-[22px] w-[22px] rounded-full bg-surface-container-lowest shadow-sm transition-transform peer-checked:translate-x-6 peer-disabled:opacity-40"
        />
      </span>
      {hint ? (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
