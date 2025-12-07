// src/app/page.tsx
import HeroCtas from '@/components/HeroCtas';
import { listProposals } from '@/lib/api';
import PublicProjectsGrid from '@/components/PublicProjectsGrid';

export const dynamic = 'force-dynamic'; // Ensure we check headers/cookies on every request

export default async function Home() {
  // Fetch approved projects (scoped to tenant via middleware -> apiFetch -> headers)
  let projects: any[] = [];
  try {
    const all = await listProposals();
    projects = all.filter(p =>
      ['approved', 'funded', 'completed'].includes(p.status) &&
      p.is_public
    );
  } catch (err) {
    console.error('Failed to load public projects:', err);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-gray-800 to-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Powering the Future–Uplifting Bolivia with
              <br />
              <span className="text-cyan-400">Lithium Social Mining</span>
            </h1>
            <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
              Proof, not Promises. Transparent funding for schools, hospitals, roads,
              infrastructure, and every cornerstone of society — secured with
              USDT/USDC transactions.
            </p>

            {/* Auth-aware CTAs (login if not authed) */}
            <HeroCtas className="flex flex-col sm:flex-row gap-4 justify-center" />
          </div>
        </div>
      </section>

      {/* Public Projects Section */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Open Projects
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Explore active projects funding our community.
            </p>
          </div>

          {projects.length > 0 ? (
            <PublicProjectsGrid items={projects} />
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <p className="text-gray-500 italic">No active projects found for this organization.</p>
            </div>
          )}
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

      {/* CTA Section (no buttons) */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Join the Revolution
          </h2>
          <p className="text-lg text-gray-600 mb-0">
            For Bolivia, from Bolivia
          </p>
          {/* Buttons removed per request */}
        </div>
      </section>
    </div>
  );
}
