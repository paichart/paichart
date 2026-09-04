"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Input } from './Input';

interface ArrayInputFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// Omit the onChange prop from the HTML input element props
// since we're handling it separately
type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>;

/**
 * A custom input field for handling arrays with comma-separated values.
 * This component handles the conversion between string input and array values.
 */
export function ArrayInputField({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  ...props
}: ArrayInputFieldProps & InputProps) {
  // Use a ref to track the raw input element
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Initialize the input value from the array value
  const [inputValue, setInputValue] = useState<string>(
    Array.isArray(value) ? value.join(', ') : ''
  );

  // Track cursor position to maintain it during updates
  const cursorPositionRef = useRef<number | null>(null);

  // Update the input value when the array value changes from outside
  useEffect(() => {
    if (Array.isArray(value)) {
      // Only update if the input doesn't have focus to avoid cursor jumping
      if (document.activeElement !== inputRef.current) {
        setInputValue(value.join(', '));
      }
    }
  }, [value]);

  // Restore cursor position after state update
  useEffect(() => {
    if (cursorPositionRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(
        cursorPositionRef.current,
        cursorPositionRef.current
      );
      cursorPositionRef.current = null;
    }
  }, [inputValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Save cursor position before state update
    if (inputRef.current) {
      cursorPositionRef.current = inputRef.current.selectionStart;
    }
    
    // Get the raw input value directly from the event
    const newInputValue = e.target.value;
    
    // Process the input to ensure all commas have a space after them
    let processedValue = newInputValue;
    
    // Check if there are any commas without a space after them
    if (newInputValue.includes(',') && !newInputValue.includes(', ')) {
      // Replace all commas with a comma and space
      processedValue = newInputValue.replace(/,(?!\s)/g, ', ');
      
      // Update the cursor position to account for added spaces
      if (cursorPositionRef.current !== null) {
        // Count how many spaces were added before the cursor
        const beforeCursor = newInputValue.substring(0, cursorPositionRef.current);
        const spacesAdded = (beforeCursor.match(/,(?!\s)/g) || []).length;
        cursorPositionRef.current += spacesAdded;
      }
    }
    
    // Always update the local state first
    setInputValue(processedValue);
    
    // Process the input value to create the array
    const arrayValue = processedValue
      .split(',')
      .map(item => item.trim())
      .filter(item => item !== '');
    
    // Call the onChange handler with the array value
    onChange(arrayValue);
  };

  // Handle key events to ensure commas are properly processed
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If the user presses Enter, add a comma
    if (e.key === 'Enter') {
      e.preventDefault();
      const newValue = inputValue + ', ';
      setInputValue(newValue);
      
      // Update the array value
      const arrayValue = newValue
        .split(',')
        .map(item => item.trim())
        .filter(item => item !== '');
      
      onChange(arrayValue);
      
      // Set cursor position after the comma and space
      cursorPositionRef.current = newValue.length;
    }
  };

  return (
    <Input
      ref={inputRef}
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      {...props}
    />
  );
}

export default ArrayInputField;
