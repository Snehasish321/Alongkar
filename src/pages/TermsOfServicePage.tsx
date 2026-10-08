import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'reicon-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';

export const TermsOfServicePage: React.FC = () => {
  useEffect(() => {
    document.title = 'Terms of Service | Alongkar';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        'content',
        'Read the Terms of Service for Alongkar. Understand our ordering terms, fashion jewellery specifications, shipping, payments, and customer policies.'
      );
    }
  }, []);

  return (
    <StorefrontLayout>
      <main className="bg-ivory py-10 sm:py-16 min-h-screen text-espresso">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Link */}
          <div className="mb-8">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-espresso-light/70 hover:text-espresso transition-colors"
            >
              <ArrowLeft size={13} />
              <span>Home</span>
            </Link>
          </div>

          {/* Page Header */}
          <header className="mb-8 sm:mb-10">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-espresso">
              Terms of Service
            </h1>
            <p className="mt-2 text-sm text-espresso-light/80 font-light leading-relaxed">
              Welcome to Alongkar. These Terms of Service explain the rules that apply when you browse our website, use our services, or place an order with us. By using Alongkar or placing an order, you agree to these Terms.
            </p>
            <p className="mt-1.5 text-[11px] text-espresso-light/50">
              Last updated: 8 October 2026
            </p>
            <div className="mt-6 h-px bg-gold/20" />
          </header>

          {/* Terms Document Body */}
          <div className="bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft p-6 sm:p-10 lg:p-12 space-y-10 text-xs sm:text-sm leading-relaxed text-espresso-light font-light">
            {/* Section 1 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                1. Acceptance of Terms
              </h2>
              <p>
                By accessing, browsing or using the Alongkar website, or by placing an order with us, you agree to comply with these Terms of Service and the policies referenced within them.
              </p>
              <p>
                If you do not agree with these Terms, please do not use the website or place an order.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                2. About Alongkar and Our Products
              </h2>
              <p>
                Alongkar is an online store offering fashion and costume jewellery and related accessories, including oxidized jewellery, city-gold-style fashion jewellery, bracelets and other trending jewellery products.
              </p>
              <p>
                Unless a product description specifically states otherwise, Alongkar products should not be considered solid gold, silver, precious-metal jewellery, precious gemstones or investment-grade jewellery.
              </p>
              <p>
                Customers should carefully review the product description and specifications before placing an order.
              </p>
            </section>

            {/* Section 3 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                3. Product Information and Appearance
              </h2>
              <p>
                We make reasonable efforts to display product photographs, descriptions and specifications accurately. However, slight differences may occur because of photography, lighting, screen settings, manufacturing variations or the nature of the product.
              </p>
              <p>
                Fashion jewellery may naturally experience changes in colour, finish or appearance over time depending on usage and storage.
              </p>
              <p>
                Exposure to sweat, water, perfume, cosmetics, chemicals and other environmental factors may affect certain jewellery finishes. Customers are encouraged to follow any care instructions provided with the product.
              </p>
            </section>

            {/* Section 4 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                4. Request Jewellery
              </h2>
              <p>
                Alongkar may allow customers to submit jewellery requests through our <Link to="/request-jewellery" className="text-gold-dark font-medium hover:underline">Request Jewellery</Link> feature. Customers may request products such as oxidized jhumkas, evil-eye bracelets or other jewellery inspired by a reference image or description.
              </p>
              <p>
                Submitting a request does not guarantee that Alongkar will be able to source or fulfil the requested item. Availability depends on supplier availability, sourcing conditions, design feasibility and other practical considerations.
              </p>
              <p>
                A requested product may not be identical to the reference image and may differ in design, colour, size, material, finish or other characteristics.
              </p>
              <p>
                A sourcing/request charge of ₹30 applies per jewellery item requested. The applicable product price, availability and other relevant details will be communicated before the customer is required to complete the purchase.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                5. Pricing and Product Availability
              </h2>
              <p>
                All prices are displayed in Indian Rupees (INR) unless stated otherwise.
              </p>
              <p>
                Product prices and availability may change without prior notice.
              </p>
              <p>
                While we make reasonable efforts to maintain accurate pricing and inventory information, occasional errors may occur. If a significant pricing, product or inventory error affects an order, Alongkar may contact the customer and, where appropriate, cancel the affected order and provide a refund for any payment already received.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                6. Payments
              </h2>
              <p>
                Payments may be processed through third-party payment providers such as Razorpay.
              </p>
              <p>
                Payment processing may be subject to the terms, conditions and availability of the applicable payment provider.
              </p>
              <p>
                An order may be processed only after the applicable payment has been successfully received or the order has otherwise been approved for the selected payment method.
              </p>
            </section>

            {/* Section 7 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                7. Prepaid Discounts and Promotional Offers
              </h2>
              <p>
                Eligible prepaid or online payments may receive a 5% discount, subject to a maximum discount of ₹80.
              </p>
              <p>
                Promotional discounts, coupons and offers may have additional eligibility requirements, usage limits, validity periods or other conditions.
              </p>
              <p>
                Alongkar may modify, suspend or withdraw a promotional offer at any time, subject to applicable law.
              </p>
            </section>

            {/* Section 8 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                8. Coupons and Coupon Misuse
              </h2>
              <p>
                Coupons are provided for legitimate promotional use and may be subject to specific terms.
              </p>
              <p>
                Alongkar may restrict or reject coupon usage where it reasonably believes that a coupon has been misused, duplicated, obtained through fraudulent means, or used in violation of its applicable conditions.
              </p>
              <p>
                Multiple promotional offers may not always be combined unless expressly stated.
              </p>
            </section>

            {/* Section 9 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                9. Shipping and Delivery
              </h2>
              <p>
                Free shipping currently applies to eligible orders above ₹399, subject to the shipping conditions displayed by Alongkar.
              </p>
              <p>
                Estimated delivery timelines are provided for convenience and are not guaranteed delivery dates.
              </p>
              <p>
                Delivery may be affected by courier delays, weather conditions, operational disruptions, incorrect or incomplete customer information, public events or other circumstances outside Alongkar&apos;s reasonable control.
              </p>
              <p>
                Additional shipping details, including applicable protections and procedures, are described in our <Link to="/shipping-policy" className="text-gold-dark font-medium hover:underline">Insured Shipping Policy</Link>.
              </p>
            </section>

            {/* Section 10 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                10. Order Cancellation
              </h2>
              <p>
                Customers may request cancellation of an order until the order has been dispatched.
              </p>
              <p>
                Once an order has been dispatched, cancellation may no longer be available and the customer may need to follow the applicable return or refund process.
              </p>
            </section>

            {/* Section 11 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                11. Cash on Delivery Orders
              </h2>
              <p>
                A ₹10 COD charge may apply to eligible Cash on Delivery orders.
              </p>
              <p>
                Alongkar may contact customers to verify COD orders before dispatch.
              </p>
              <p>
                To protect against fraudulent or abusive orders, Alongkar reserves the right to cancel COD orders that are suspicious, incomplete, unverified, fraudulent or otherwise considered unsuitable for fulfilment.
              </p>
            </section>

            {/* Section 12 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                12. Returns, Refunds and Replacements
              </h2>
              <p>
                Returns, refunds and replacements are governed by Alongkar&apos;s separate <Link to="/returns" className="text-gold-dark font-medium hover:underline">7-Day Return Policy</Link>.
              </p>
              <p>
                Customers should review the <Link to="/returns" className="text-gold-dark font-medium hover:underline">7-Day Return Policy</Link> before placing an order.
              </p>
              <p>
                For matters specifically relating to returns, refunds or replacements, the applicable provisions of the 7-Day Return Policy will govern.
              </p>
            </section>

            {/* Section 13 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                13. Customer Accounts and Information
              </h2>
              <p>
                Customers are responsible for providing accurate and current information when creating an account, placing an order or communicating with Alongkar.
              </p>
              <p>
                Customers are responsible for maintaining the security of their account credentials and should notify Alongkar if they believe their account has been compromised.
              </p>
              <p>
                Alongkar may restrict or suspend accounts where it reasonably believes there has been fraudulent activity, misuse, false information, repeated abuse or other conduct that may harm Alongkar or its customers.
              </p>
            </section>

            {/* Section 14 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                14. Acceptable Use
              </h2>
              <p>
                Customers must use the Alongkar website lawfully and responsibly.
              </p>
              <p>
                Customers must not attempt to hack, disrupt, overload or interfere with the website or its underlying systems.
              </p>
              <p>
                Customers must not introduce malicious code, use automated systems to abuse the service, place fraudulent orders, misuse promotional offers, impersonate another person or use the website for unlawful purposes.
              </p>
            </section>

            {/* Section 15 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                15. Reviews, Photos and User-Submitted Content
              </h2>
              <p>
                Customers may have opportunities to submit reviews, photographs, feedback, inspiration images or other content to Alongkar.
              </p>
              <p>
                Customers should only submit content that they have the right to share and that does not unlawfully infringe another person&apos;s rights.
              </p>
              <p>
                By submitting content to Alongkar, the customer grants Alongkar permission to use, display, reproduce or publish that content for legitimate business purposes, including displaying customer reviews or product-related content on Alongkar&apos;s website and promotional channels, subject to applicable law.
              </p>
              <p>
                Alongkar may remove or decline to publish content that is unlawful, misleading, abusive, inappropriate, fraudulent or otherwise unsuitable.
              </p>
            </section>

            {/* Section 16 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                16. Intellectual Property and Website Content
              </h2>
              <p>
                Original content created or published by Alongkar, including website text, product descriptions, photographs, graphics, visual assets, branding and other original materials, is owned by Alongkar or used with appropriate permission.
              </p>
              <p>
                Such content may not be copied, reproduced, modified, distributed, republished or commercially reused without appropriate permission.
              </p>
              <p>
                Nothing in these Terms grants a customer ownership rights in Alongkar&apos;s original website content or branding.
              </p>
            </section>

            {/* Section 17 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                17. Third-Party Services
              </h2>
              <p>
                Alongkar may rely on third-party services for payment processing, shipping, authentication, hosting, communications, analytics and other functionality.
              </p>
              <p>
                Third-party services are subject to their own terms and policies. Alongkar cannot guarantee the continuous availability, performance or operation of services that are controlled by third parties.
              </p>
              <p>
                Where a service interruption or failure is caused entirely by a third party, Alongkar will make reasonable efforts to resolve or work around the issue where practical.
              </p>
            </section>

            {/* Section 18 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                18. Website Availability
              </h2>
              <p>
                We aim to keep Alongkar available and functional, but uninterrupted access cannot be guaranteed.
              </p>
              <p>
                The website may occasionally be unavailable because of maintenance, technical issues, infrastructure problems, security measures, third-party service interruptions or other circumstances beyond our reasonable control.
              </p>
            </section>

            {/* Section 19 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                19. Limitation of Liability
              </h2>
              <p>
                Alongkar will make reasonable efforts to provide accurate information and reliable services. However, to the extent permitted by applicable law, Alongkar will not be responsible for indirect or consequential losses arising from circumstances reasonably outside our control.
              </p>
              <p>
                Nothing in these Terms is intended to exclude or limit any consumer right or protection that cannot lawfully be excluded or limited under applicable Indian law.
              </p>
            </section>

            {/* Section 20 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                20. Changes to These Terms
              </h2>
              <p>
                Alongkar may update these Terms of Service from time to time to reflect changes to our services, business practices, legal requirements or website functionality.
              </p>
              <p>
                The latest version published on this page will apply to future use of the website and future orders.
              </p>
            </section>

            {/* Section 21 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                21. Governing Law and Jurisdiction
              </h2>
              <p>
                These Terms are governed by and interpreted in accordance with the laws of India.
              </p>
              <p>
                Subject to applicable law, courts having appropriate jurisdiction in Birbhum, West Bengal may have jurisdiction over disputes arising in connection with these Terms or the use of the Alongkar website.
              </p>
            </section>

            {/* Section 22 */}
            <section className="space-y-4">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                22. Contact Us
              </h2>
              <p>
                If you have questions about these Terms of Service, you can contact Alongkar using the information below.
              </p>
              <div className="bg-ivory p-4 sm:p-5 rounded-brand border border-gold/15 space-y-1.5 text-xs text-espresso">
                <p><span className="font-semibold">Business Name:</span> Alongkar</p>
                <div className="flex flex-col sm:flex-row sm:gap-1">
                  <span className="font-semibold">Address:</span>
                  <span>Saradapally, Rampurhat, Birbhum, West Bengal – 731224, India</span>
                </div>
                <p>
                  <span className="font-semibold">Email:</span>{' '}
                  <a href="mailto:alongkar.official@gmail.com" className="text-gold-dark font-medium hover:underline">
                    alongkar.official@gmail.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>
    </StorefrontLayout>
  );
};
