import React, { useState } from 'react';
import { Mail, Phone, MapPin, Clock, Send, CheckCircle2 } from 'lucide-react';
import { SectionHeading } from '../components/ui/SectionHeading';
import { Button } from '../components/ui/Button';

export const ContactPage: React.FC = () => {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: '', email: '', phone: '', message: '' });
    }, 4000);
  };

  return (
    <main className="py-12 sm:py-20 bg-ivory">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading title="Get In Touch" subtitle="We are here to assist your jewellery journey" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Contact Details Column */}
          <div className="space-y-6">
            <div className="p-6 bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft space-y-4">
              <h3 className="font-serif text-lg font-bold text-espresso">Customer Care</h3>
              <p className="text-xs text-gray-500">
                Have questions about an order, custom size, or jewellery care? Reach out to our concierge team.
              </p>

              <div className="space-y-3 pt-2 text-xs text-espresso">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center text-gold">
                    <Phone size={16} />
                  </div>
                  <div>
                    <span className="block font-semibold">Phone / WhatsApp</span>
                    <span className="text-gray-500">+91 98765 43210</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center text-gold">
                    <Mail size={16} />
                  </div>
                  <div>
                    <span className="block font-semibold">Email Concierge</span>
                    <span className="text-gray-500">care@alongkar.com</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center text-gold">
                    <Clock size={16} />
                  </div>
                  <div>
                    <span className="block font-semibold">Hours</span>
                    <span className="text-gray-500">Mon - Sat: 10:00 AM - 7:00 PM IST</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center text-gold">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <span className="block font-semibold">Flagship Experience Studio</span>
                    <span className="text-gray-500">Park Street, Kolkata, WB - 700016</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form Column */}
          <div className="lg:col-span-2 p-6 sm:p-8 bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft">
            <h3 className="font-serif text-xl font-bold text-espresso mb-2">Send Us A Message</h3>
            <p className="text-xs text-gray-500 mb-6">Fill out the form below and we will get back to you within 24 hours.</p>

            {submitted ? (
              <div className="py-12 text-center space-y-3 bg-ivory rounded-brand border border-gold/20 p-6">
                <CheckCircle2 size={40} className="mx-auto text-gold" />
                <h4 className="font-serif text-lg font-bold text-espresso">Message Received!</h4>
                <p className="text-xs text-gray-500">
                  Thank you for reaching out to ALONGKAR. Our customer care specialist will respond shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-espresso font-medium mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Priya Sharma"
                      className="w-full bg-ivory text-xs text-espresso p-3 rounded-brand border border-gold/20 focus:outline-none focus:border-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-espresso font-medium mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="e.g. priya@example.com"
                      className="w-full bg-ivory text-xs text-espresso p-3 rounded-brand border border-gold/20 focus:outline-none focus:border-gold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-espresso font-medium mb-1">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 98765 00000"
                    className="w-full bg-ivory text-xs text-espresso p-3 rounded-brand border border-gold/20 focus:outline-none focus:border-gold"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-espresso font-medium mb-1">
                    Message *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Tell us how we can help you..."
                    className="w-full bg-ivory text-xs text-espresso p-3 rounded-brand border border-gold/20 focus:outline-none focus:border-gold"
                  />
                </div>

                <Button type="submit" variant="gold" size="lg" className="gap-2">
                  <Send size={16} />
                  <span>SEND MESSAGE</span>
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
