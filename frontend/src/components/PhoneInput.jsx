import React from 'react';
import { maskPhone, unformatPhone } from '../utils';

export default function PhoneInput({ value, onChange, placeholder = '(00) 9 0000-0000', ...props }) {
  const displayed = maskPhone((value || '').replace(/\D/g, '').replace(/^55/, ''));

  const handleChange = (e) => {
    const masked = maskPhone(e.target.value);
    const raw = unformatPhone(masked);
    onChange(raw);
  };

  return (
    <input
      {...props}
      className="input"
      type="tel"
      value={displayed}
      onChange={handleChange}
      placeholder={placeholder}
      maxLength={17}
    />
  );
}
