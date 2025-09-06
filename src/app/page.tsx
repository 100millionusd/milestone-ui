// src/app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-gray-800 to-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Streamline Projects with
              <br />
              <span className="text-cyan-400">Milestone Payments</span>
            </h1>
            <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
              Professional project management with transparent bidding, milestone-based payments, 
              and secure USDT/USDC transactions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/projects"
                className="bg-cyan-500 hover:bg-cyan-600 text-white px-8 py-3 rounded-lg font-semibold text-lg transition-colors"
              >
                Browse Projects
              </Link>
              <Link
                href="/new"
                className="border-2 border-white text-white hover:bg-white hover:text-gray-900 px-8 py-3 rounded-lg font-semibold text-lg transition-colors"
              >
                Submit Proposal
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
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
              { number: '1', title: 'Create Project', description: 'Submit detailed project proposals with requirements and budget' },
              { number: '2', title: 'Receive Bids', description: 'Vendors submit bids with milestone breakdowns and pricing' },
              { number: '3', title: 'Approve Work', description: 'Review and approve completed milestones with proof of work' },
              { number: '4', title: 'Release Payment', description: 'Automated USDT/USDC payments upon milestone completion' }
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

      {/* CTA Section */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Join professionals who trust our platform for transparent project management and secure payments
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/projects"
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Explore Projects
            </Link>
            <Link
              href="/new"
              className="border border-gray-300 text-gray-700 hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Create Project
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}