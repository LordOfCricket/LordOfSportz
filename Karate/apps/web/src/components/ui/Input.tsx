import { type InputHTMLAttributes, type ReactNode, forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
  hint?: string;
  /** Optional slot rendered inside the field, right-aligned (e.g. a password visibility toggle). */
  endAdornment?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, errorMessage, hint, endAdornment, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = errorMessage ? `${inputId}-error` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-text-primary">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={cn(hintId, errorId) || undefined}
            className={cn(
              "h-10 w-full rounded-md border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              endAdornment ? "pr-10" : undefined,
              errorMessage ? "border-danger" : "border-border",
              className,
            )}
            {...props}
          />
          {endAdornment && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">{endAdornment}</div>
          )}
        </div>
        {hint && !errorMessage && (
          <p id={hintId} className="text-xs text-text-muted">
            {hint}
          </p>
        )}
        {errorMessage && (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {errorMessage}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
