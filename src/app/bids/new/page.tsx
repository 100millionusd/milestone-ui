'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBid } from '@/lib/api';

export default function NewBidPage() {
  const searchParams = useSearchParams();
  const proposalId = searchParams.get('proposalId');

  const [formData, setFormData] = useState({
    vendorName: '',
    priceUSD: '',
    days: '',
    notes: '',
    walletAddress: '',
    preferredStablecoin: 'USDT',
  });
  const [milestones, setMilestones] = useState([{ name: '', amount: '', dueDate: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Reset form when successfully submitted
    if (success) {
      const timer = setTimeout(() => {
        setFormData({
          vendorName: '',
          priceUSD: '',
          days: '',
          notes: '',
          walletAddress: '',
          preferredStablecoin: 'USDT',
        });
        setMilestones([{ name: '', amount: '', dueDate: '' }]);
        setTouched({});
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    // Mark all fields as touched for validation
    const allTouched = Object.keys(formData).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {} as Record<string, boolean>);
    setTouched(allTouched);

    // Validate required fields
    if (!formData.vendorName || !formData.priceUSD || !formData.days || !formData.walletAddress) {
      setError('Please fill in all required fields');
      setSubmitting(false);
      return;
    }

    // Validate milestones
    for (const milestone of milestones) {
      if (!milestone.name || !milestone.amount || !milestone.dueDate) {
        setError('Please fill in all milestone fields');
        setSubmitting(false);
        return;
      }
    }

    try {
      const bidPayload = {
        proposalId: Number(proposalId),
        vendorName: formData.vendorName,
        priceUSD: Number(formData.priceUSD),
        days: Number(formData.days),
        notes: formData.notes,
        walletAddress: formData.walletAddress,
        preferredStablecoin: formData.preferredStablecoin,
        milestones: milestones.map((m) => ({
          name: m.name,
          amount: Number(m.amount),
          dueDate: m.dueDate,
        })),
      };

      const res = await createBid(bidPayload);

      if (res.ok) {
        setSuccess(true);
        setAiAnalysis(res.aiAnalysis || null);
      } else {
        setError(res.error || 'Failed to create bid');
      }
    } catch (err: any) {
      console.error('Error creating bid:', err);
      setError(err.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMilestoneChange = (index: number, field: string, value: string) => {
    const newMilestones = [...milestones];
    newMilestones[index] = { ...newMilestones[index], [field]: value };
    setMilestones(newMilestones);
  };

  const addMilestone = () => {
    setMilestones([...milestones, { name: '', amount: '', dueDate: '' }]);
  };

  const removeMilestone = (index: number) => {
    if (milestones.length > 1) {
      const newMilestones = [...milestones];
      newMilestones.splice(index, 1);
      setMilestones(newMilestones);
    }
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'Fair': return 'text-green-600 bg-green-100';
      case 'Overpriced': return 'text-red-600 bg-red-100';
      case 'Underpriced': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-800">Submit a New Bid</h1>
        <p className="text-gray-600 mt-2">Fill in the details below to submit your bid proposal</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendor Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="vendorName"
              value={formData.vendorName}
              onChange={handleInputChange}
              className={`w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${touched.vendorName && !formData.vendorName ? 'border-red-500' : 'border-gray-300'}`}
              required
            />
            {touched.vendorName && !formData.vendorName && (
              <p className="text-red-500 text-xs mt-1">Vendor name is required</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preferred Stablecoin
            </label>
            <select
              name="preferredStablecoin"
              value={formData.preferredStablecoin}
              onChange={handleInputChange}
              className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
              <option value="DAI">DAI</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price (USD) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-500">$</span>
              <input
                type="number"
                name="priceUSD"
                value={formData.priceUSD}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className={`w-full border pl-8 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${touched.priceUSD && !formData.priceUSD ? 'border-red-500' : 'border-gray-300'}`}
                required
              />
            </div>
            {touched.priceUSD && !formData.priceUSD && (
              <p className="text-red-500 text-xs mt-1">Price is required</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Timeline (Days) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="days"
              value={formData.days}
              onChange={handleInputChange}
              min="1"
              className={`w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${touched.days && !formData.days ? 'border-red-500' : 'border-gray-300'}`}
              required
            />
            {touched.days && !formData.days && (
              <p className="text-red-500 text-xs mt-1">Timeline is required</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Wallet Address <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="walletAddress"
            value={formData.walletAddress}
            onChange={handleInputChange}
            placeholder="0x..."
            className={`w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${touched.walletAddress && !formData.walletAddress ? 'border-red-500' : 'border-gray-300'}`}
            required
          />
          {touched.walletAddress && !formData.walletAddress && (
            <p className="text-red-500 text-xs mt-1">Wallet address is required</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={3}
            className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Any additional information about your bid..."
          />
        </div>

        <div className="border-t pt-4">
          <h3 className="font-medium text-lg mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
            Milestones
          </h3>
          
          {milestones.map((m, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4 items-start p-4 bg-gray-50 rounded-lg">
              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="Milestone name"
                  value={m.name}
                  onChange={(e) => handleMilestoneChange(idx, 'name', e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  placeholder="Amount"
                  value={m.amount}
                  onChange={(e) => handleMilestoneChange(idx, 'amount', e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={m.dueDate}
                  onChange={(e) => handleMilestoneChange(idx, 'dueDate', e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div className="md:col-span-1 flex justify-end md:justify-start md:pt-6">
                {milestones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMilestone(idx)}
                    className="text-red-500 hover:text-red-700 p-2"
                    title="Remove milestone"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
          
          <button
            type="button"
            onClick={addMilestone}
            className="flex items-center text-blue-600 hover:text-blue-800 font-medium text-sm mt-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add Another Milestone
          </button>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            {submitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              'Submit Bid'
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-700 font-medium">Error: {error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-green-700 font-medium">Bid submitted successfully!</span>
          </div>
        </div>
      )}

      {aiAnalysis && (
        <div className="mt-8 p-6 border rounded-lg bg-gray-50">
          <h3 className="font-medium text-xl mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-purple-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            AI Analysis Result
          </h3>

          {aiAnalysis.verdict && (
            <div className={`inline-flex items-center px-4 py-2 rounded-full mb-4 ${getVerdictColor(aiAnalysis.verdict)}`}>
              <span className="font-semibold">Verdict: {aiAnalysis.verdict}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {aiAnalysis.priceCheck && (
              <div className="p-4 bg-white rounded-lg border">
                <h4 className="font-medium text-gray-700 mb-2">Price Evaluation</h4>
                <p className="text-gray-600">{aiAnalysis.priceCheck}</p>
              </div>
            )}

            {aiAnalysis.timelineCheck && (
              <div className="p-4 bg-white rounded-lg border">
                <h4 className="font-medium text-gray-700 mb-2">Timeline Evaluation</h4>
                <p className="text-gray-600">{aiAnalysis.timelineCheck}</p>
              </div>
            )}
          </div>

          {aiAnalysis.referenceComparison && (
            <div className="mt-4 p-4 bg-white rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Market Comparison</h4>
              <div className="text-sm text-gray-800 bg-gray-50 p-3 rounded mt-1 overflow-x-auto">
                <pre>{JSON.stringify(aiAnalysis.referenceComparison, null, 2)}</pre>
              </div>
            </div>
          )}

          {aiAnalysis.issues && aiAnalysis.issues.length > 0 && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <h4 className="font-medium text-yellow-800 mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Potential Issues
              </h4>
              <ul className="list-disc pl-5 text-yellow-700">
                {aiAnalysis.issues.map((issue: string, idx: number) => (
                  <li key={idx} className="mb-1">{issue}</li>
                ))}
              </ul>
            </div>
          )}

          <details className="mt-6">
            <summary className="cursor-pointer text-blue-600 text-sm font-medium flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Show full AI analysis data
            </summary>
            <div className="mt-2 p-4 bg-gray-100 rounded-lg">
              <pre className="whitespace-pre-wrap text-xs text-gray-700">
                {JSON.stringify(aiAnalysis, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}