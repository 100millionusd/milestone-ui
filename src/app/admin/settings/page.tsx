'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Form State
    const [pinataJwt, setPinataJwt] = useState('');
    const [pinataGateway, setPinataGateway] = useState('');
    const [paymentAddress, setPaymentAddress] = useState("");
    const [paymentStablecoin, setPaymentStablecoin] = useState("USDT");
    const [safeChainId, setSafeChainId] = useState("");
    const [safeRpcUrl, setSafeRpcUrl] = useState("");
    const [safeOwnerKey, setSafeOwnerKey] = useState("");
    const [safeServiceUrl, setSafeServiceUrl] = useState("");
    const [safeApiKey, setSafeApiKey] = useState("");
    const [safeReconcileMinutes, setSafeReconcileMinutes] = useState("");
    const [safeThresholdUsd, setSafeThresholdUsd] = useState("");
    const [safeAddress, setSafeAddress] = useState("");

    useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        try {
            setLoading(true);
            const [jwt, gw, addr, coin, chainId, rpcUrl, ownerKey, serviceUrl, apiKey, reconcile, threshold, safeAddr] = await Promise.all([
                apiFetch('/api/tenants/config/pinata_jwt').then(r => r.value),
                apiFetch('/api/tenants/config/pinata_gateway').then(r => r.value),
                apiFetch('/api/tenants/config/payment_address').then(r => r.value),
                apiFetch('/api/tenants/config/payment_stablecoin').then(r => r.value),
                apiFetch('/api/tenants/config/safe_chain_id').then(r => r.value),
                apiFetch('/api/tenants/config/safe_rpc_url').then(r => r.value),
                apiFetch('/api/tenants/config/safe_owner_key').then(r => r.value),
                apiFetch('/api/tenants/config/safe_service_url').then(r => r.value),
                apiFetch('/api/tenants/config/safe_api_key').then(r => r.value),
                apiFetch('/api/tenants/config/safe_reconcile_minutes').then(r => r.value),
                apiFetch('/api/tenants/config/safe_threshold_usd').then(r => r.value),
                apiFetch('/api/tenants/config/safe_address').then(r => r.value)
            ]);

            setPinataJwt(jwt || "");
            setPinataGateway(gw || "");
            setPaymentAddress(addr || "");
            setPaymentStablecoin(coin || "USDT");
            setSafeChainId(chainId || "");
            setSafeRpcUrl(rpcUrl || "");
            setSafeOwnerKey(ownerKey || "");
            setSafeServiceUrl(serviceUrl || "");
            setSafeApiKey(apiKey || "");
            setSafeReconcileMinutes(reconcile || "");
            setSafeThresholdUsd(threshold || "");
            // If safe_address is set, use it. Otherwise fallback to payment_address for display if safe_address is empty?
            // Better to keep them distinct to avoid confusion. If safe_address is empty, it's empty.
            setSafeAddress(safeAddr || "");
        } catch (e) {
            console.error('Failed to load settings', e);
            setMsg({ type: 'error', text: 'Failed to load settings' });
        } finally {
            setLoading(false);
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setMsg(null);

        try {
            await Promise.all([
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'pinata_jwt', value: pinataJwt, isEncrypted: true }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'pinata_gateway', value: pinataGateway }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'payment_address', value: paymentAddress }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'payment_stablecoin', value: paymentStablecoin }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'safe_chain_id', value: safeChainId }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'safe_rpc_url', value: safeRpcUrl }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'safe_owner_key', value: safeOwnerKey, isEncrypted: true }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'safe_service_url', value: safeServiceUrl }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'safe_api_key', value: safeApiKey, isEncrypted: true }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'safe_reconcile_minutes', value: safeReconcileMinutes }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'safe_threshold_usd', value: safeThresholdUsd }) }),
                apiFetch('/api/tenants/config', { method: 'POST', body: JSON.stringify({ key: 'safe_address', value: safeAddress }) })
            ]);
            setMsg({ type: 'success', text: 'Settings saved successfully' });
        } catch (e: any) {
            console.error('Failed to save settings', e);
            setMsg({ type: 'error', text: e.message || 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    }

    if (loading) return <div className="p-8 text-gray-400">Loading settings...</div>;

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-white mb-8">Organization Settings</h1>

            {msg && (
                <div className={`mb-6 p-4 rounded-lg border ${msg.type === 'success' ? 'bg-green-500/10 border-green-500/50 text-green-200' : 'bg-rose-500/10 border-rose-500/50 text-rose-200'}`}>
                    {msg.text}
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-8">
                {/* Pinata Configuration */}
                <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="text-cyan-400">☁️</span> IPFS Storage (Pinata)
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">
                        Configure your own Pinata account for storing proposals, bids, and proofs.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Pinata JWT</label>
                            <input
                                type="password"
                                value={pinataJwt}
                                onChange={e => setPinataJwt(e.target.value)}
                                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            />
                            <p className="text-xs text-gray-500 mt-1">Found in Pinata API Keys section</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Gateway URL</label>
                            <input
                                type="text"
                                value={pinataGateway}
                                onChange={e => setPinataGateway(e.target.value)}
                                placeholder="https://gateway.pinata.cloud"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                </section>

                {/* Payment Configuration */}
                <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="text-green-400">💰</span> Payments
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">
                        Set the wallet address that will receive funds and your preferred stablecoin.
                    </p>

                    <div className="space-y-4">
                        {/* Removed Treasury Wallet Address from here */}

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Preferred Stablecoin</label>
                            <select
                                value={paymentStablecoin}
                                onChange={(e) => setPaymentStablecoin(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            >
                                <option value="USDT">USDT (Tether)</option>
                                <option value="USDC">USDC (Circle)</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* SAFE CONFIGURATION */}
                <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="text-purple-400">🛡️</span> Safe Configuration (Advanced)
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">
                        Configure the Gnosis Safe settings for your chain. Leave blank to use system defaults (Sepolia).
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Safe Address</label>
                            <input
                                type="text"
                                value={safeAddress}
                                onChange={(e) => setSafeAddress(e.target.value)}
                                placeholder="0x..."
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-1">The address of your Gnosis Safe contract.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Chain ID</label>
                            <input
                                type="number"
                                value={safeChainId}
                                onChange={(e) => setSafeChainId(e.target.value)}
                                placeholder="11155111"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-1">e.g. 1 (Mainnet), 10 (Optimism), 11155111 (Sepolia)</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">RPC URL</label>
                            <input
                                type="text"
                                value={safeRpcUrl}
                                onChange={(e) => setSafeRpcUrl(e.target.value)}
                                placeholder="https://rpc.ankr.com/eth_sepolia"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Safe Owner Private Key</label>
                            <input
                                type="password"
                                value={safeOwnerKey}
                                onChange={(e) => setSafeOwnerKey(e.target.value)}
                                placeholder="0x..."
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                            />
                            <p className="text-xs text-amber-500/80 mt-1">
                                ⚠️ Required for the server to propose transactions. Stored encrypted.
                            </p>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Safe Transaction Service URL</label>
                            <input
                                type="text"
                                value={safeServiceUrl}
                                onChange={(e) => setSafeServiceUrl(e.target.value)}
                                placeholder="https://api.safe.global/tx-service/sep"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Safe API Key</label>
                            <input
                                type="password"
                                value={safeApiKey}
                                onChange={(e) => setSafeApiKey(e.target.value)}
                                placeholder="Required for some Safe services..."
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Reconcile Minutes</label>
                            <input
                                type="number"
                                value={safeReconcileMinutes}
                                onChange={(e) => setSafeReconcileMinutes(e.target.value)}
                                placeholder="10"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-1">Interval for checking transaction status.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Safe Threshold (USD)</label>
                            <input
                                type="number"
                                value={safeThresholdUsd}
                                onChange={(e) => setSafeThresholdUsd(e.target.value)}
                                placeholder="0"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-1">Minimum amount to trigger Safe payment.</p>
                        </div>
                    </div>
                </section>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className={`px-6 py-2 rounded-lg font-semibold text-white transition-all ${saving
                            ? 'bg-gray-600 cursor-not-allowed'
                            : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20'
                            }`}
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
}
