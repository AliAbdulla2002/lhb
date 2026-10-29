import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "block w-full rounded-xl border border-char-900/15 bg-white px-4 py-3 text-char-900 placeholder:text-char-700/45 transition focus:border-flame-500 focus:outline-none focus:ring-4 focus:ring-flame-400/25 aria-[invalid=true]:border-ember-500";

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
}

export function FieldShell({ label, error, hint, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-char-800">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-char-700/70">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-ember-700">
          {error}
        </p>
      )}
    </div>
  );
}

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField({ label, error, hint, className, ...props }, ref) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy }) => (
        <input ref={ref} id={id} aria-invalid={!!error} aria-describedby={describedBy} className={cn(control, className)} {...props} />
      )}
    </FieldShell>
  );
});

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string };

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(function TextareaField(
  { label, error, hint, className, ...props },
  ref,
) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy }) => (
        <textarea
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn(control, "min-h-20 resize-y", className)}
          {...props}
        />
      )}
    </FieldShell>
  );
});

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string };

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField({ label, error, className, children, ...props }, ref) {
  return (
    <FieldShell label={label} error={error}>
      {({ id, describedBy }) => (
        <select ref={ref} id={id} aria-invalid={!!error} aria-describedby={describedBy} className={cn(control, className)} {...props}>
          {children}
        </select>
      )}
    </FieldShell>
  );
});
