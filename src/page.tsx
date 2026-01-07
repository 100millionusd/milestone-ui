import HeroCtas from '@/components/HeroCtas';

export const dynamic = 'force-dynamic'; // Ensure we check headers/cookies on every request

export default async function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-gray-800 to-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              The Future of Project Funding is
              <br />
              <span className="text-cyan-400">Milestone-Based</span>
            </h1>
            <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
              Eliminate risk with smart-contract escrow and AI-powered proof of work.
              Manage projects globally with instant USDT/USDC settlement.
            </p>

            {/* Auth-aware CTAs (login if not authed) */}
            <HeroCtas className="flex flex-col sm:flex-row gap-4 justify-center" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              A seamless process from project creation to milestone completion and payment
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { number: '1', title: 'Define Milestones', description: 'Set clear deliverables, deadlines, and budget requirements' },
              { number: '2', title: 'Connect with Vendors', description: 'Receive competitive bids from verified global providers' },
              { number: '3', title: 'AI-Verified Proofs', description: 'Automated analysis of proof-of-work uploads for quality assurance' },
              { number: '4', title: 'Instant Settlement', description: 'Funds release automatically via smart contract upon approval' }
            ].map((feature, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-cyan-600">{feature.number}</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section (no buttons) */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

          {/* Transparency & Security Section */}
          <div className="mb-12">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Transparency & Security
            </h3>
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="flex items-center space-x-2 text-gray-600">
                <span>Audit Trail Anchored on</span>
                <img
                  src="/images/logos/sonic.png"
                  alt="SonicLabs"
                  className="h-5 w-auto object-contain" // Reduced to h-5 (20px)
                  style={{ height: '20px' }}
                />
              </div>
              <p className="text-sm text-gray-500">
                All project events are immutably verified on-chain.
              </p>
            </div>
          </div>

          {/* Payments Powered By Section */}
          <div className="mb-16">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-6">
              Payments Powered By
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
              <img
                src="/images/logos/safe.png"
                alt="Safe{Wallet}"
                className="h-5 w-auto object-contain opacity-75 hover:opacity-100 transition-opacity" // Reduced to h-5 (20px)
                style={{ height: '20px' }}
              />
              <img
                src="/images/logos/tether.png"
                alt="Tether"
                className="h-5 w-auto object-contain opacity-75 hover:opacity-100 transition-opacity"
                style={{ height: '20px' }}
              />
              <img
                src="/images/logos/circle.png"
                alt="Circle"
                className="h-5 w-auto object-contain opacity-75 hover:opacity-100 transition-opacity"
                style={{ height: '20px' }}
              />
            </div>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Build with Confidence
          </h2>
          <p className="text-lg text-gray-600 mb-0">
            Secure. Transparent. Efficient.
          </p>
        </div>
      </section>
    </div>
  );
}
