import React from 'react';
import { motion } from 'framer-motion';
import { Award, ShieldCheck, Truck, RefreshCw } from 'lucide-react';

export const WhyAlongkarSection: React.FC = () => {
  const features = [
    {
      icon: <Award size={32} className="text-gold" />,
      title: 'Quality Checked',
      description: 'Multi-stage quality control ensuring pure 24K city gold lustre and skin-friendly metals.',
    },
    {
      icon: <ShieldCheck size={32} className="text-gold" />,
      title: 'Secure Packaging',
      description: 'Tamper-proof luxury signature box with moisture-protected velvet interior.',
    },
    {
      icon: <Truck size={32} className="text-gold" />,
      title: 'Fast Delivery',
      description: 'Dispatched within 24 hours with real-time tracking across 20,000+ PIN codes.',
    },
    {
      icon: <RefreshCw size={32} className="text-gold" />,
      title: 'Easy Returns',
      description: 'Hassle-free 7-day return and exchange policy for complete peace of mind.',
    },
  ];

  return (
    <section className="py-16 sm:py-20 bg-ivory">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-12">
          <span className="text-xs uppercase tracking-[0.25em] text-gold font-bold">THE ALONGKAR PROMISE</span>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-espresso mt-1">Why Choose Alongkar</h2>
          <div className="w-12 h-[1.5px] bg-gold/50 mx-auto mt-3" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((item, idx) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="p-6 bg-ivory-pearl rounded-brand border border-gold/15 shadow-soft hover:shadow-elevated transition-all text-center flex flex-col items-center space-y-3"
            >
              <div className="p-3 bg-gold/10 rounded-full">{item.icon}</div>
              <h3 className="font-serif text-base font-semibold text-espresso">{item.title}</h3>
              <p className="text-xs text-espresso-light font-light leading-relaxed">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
