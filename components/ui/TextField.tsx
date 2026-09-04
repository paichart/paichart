'use client';

import * as React from 'react';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { cn } from '@/lib/utils';

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helperText?: string;
  error?: boolean;
  fullWidth?: boolean;
  variant?: 'outlined' | 'filled' | 'standard';
  size?: 'small' | 'medium';
  readOnly?: boolean;
  FormHelperTextProps?: React.HTMLAttributes<HTMLParagraphElement>;
  InputLabelProps?: React.LabelHTMLAttributes<HTMLLabelElement>;
}

const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  (props, ref) => {
    const {
      label,
      helperText,
      error,
      fullWidth = true,
      size = 'medium',
      required,
      disabled,
      readOnly,
      id = 'textfield',
      className,
      FormHelperTextProps,
      InputLabelProps,
      ...rest
    } = props;

    const helperId = helperText ? `${id}-helper-text` : undefined;
    const labelId = `${id}-label`;

    return (
      <div className={cn("grid w-full gap-1.5", fullWidth ? "w-full" : "w-auto")}>
        {label && (
          <Label
            htmlFor={id}
            id={labelId}
            className={cn(
              required && "after:content-['*'] after:ml-0.5 after:text-destructive",
              error && "text-destructive",
              InputLabelProps?.className
            )}
            {...InputLabelProps}
          >
            {label}
          </Label>
        )}
        <Input
          ref={ref}
          id={id}
          className={cn(
            size === 'small' && "h-8 px-3 py-1 text-sm",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          aria-required={required ? 'true' : undefined}
          aria-disabled={disabled ? 'true' : undefined}
          aria-readonly={readOnly ? 'true' : undefined}
          aria-describedby={helperId}
          aria-labelledby={labelId}
          {...rest}
        />
        {helperText && (
          <p
            id={helperId}
            className={cn(
              "text-sm text-muted-foreground",
              error && "text-destructive",
              FormHelperTextProps?.className
            )}
            {...FormHelperTextProps}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

TextField.displayName = 'TextField';

export default TextField;
