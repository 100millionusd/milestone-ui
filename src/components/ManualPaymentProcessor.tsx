// src/components/ManualPaymentProcessor.tsx
'use client';

import React from 'react';

// We keep the interface so TypeScript doesn't complain about the parent component passing props
interface ManualPaymentProcessorProps {
  bid: any;
  onPaymentComplete: () => void;
}

const ManualPaymentProcessor: React.FC<ManualPaymentProcessorProps> = () => {
  // Return null to hide this component completely from the UI
  return null;
};

export default ManualPaymentProcessor;