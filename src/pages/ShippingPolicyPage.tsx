import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'reicon-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';

export const ShippingPolicyPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Insured Shipping Policy | Alongkar';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        'content',
        "Read Alongkar's Insured Shipping Policy. Learn about our shipping protection, delivery timelines, charges, reporting windows, and claims process."
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
              Insured Shipping Policy
            </h1>
            <p className="mt-2 text-sm text-espresso-light/80 font-light leading-relaxed">
              At Alongkar, we take care in preparing and shipping every order. Our shipping protection is designed to provide customers with support in situations such as transit loss, transit damage, missing items or incorrect products. Coverage and claims are subject to the applicable shipping service, protection terms and verification requirements.
            </p>
            <p className="mt-1.5 text-[11px] text-espresso-light/50">
              Last updated: 8 October 2026
            </p>
            <div className="mt-6 h-px bg-gold/20" />
          </header>

          {/* Policy Document Body */}
          <div className="bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft p-6 sm:p-10 lg:p-12 space-y-10 text-xs sm:text-sm leading-relaxed text-espresso-light font-light">
            {/* Section 1 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                1. Shipping Coverage
              </h2>
              <p>
                Alongkar ships orders through available logistics partners and shipping services supported for the customer&apos;s delivery PIN code.
              </p>
              <p>
                Shipping availability depends on whether the customer&apos;s PIN code is serviceable by our logistics partner.
              </p>
              <p>
                We currently ship only to locations where the applicable shipping service provides delivery coverage.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                2. Shipping Charges
              </h2>
              <p>
                A standard shipping charge of ₹40 applies to eligible orders unless the order qualifies for free shipping.
              </p>
              <p>
                Orders above ₹399 currently qualify for free shipping, subject to the applicable conditions displayed by Alongkar.
              </p>
              <p>
                Shipping charges and free-shipping eligibility may be changed by Alongkar from time to time.
              </p>
            </section>

            {/* Section 3 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                3. Estimated Delivery Time
              </h2>
              <p>
                The estimated delivery time for Alongkar orders is generally 8–10 days from dispatch, subject to the destination, courier availability and other operational conditions.
              </p>
              <p>
                Delivery timelines are estimates and are not guaranteed delivery dates.
              </p>
              <p>
                Delivery may take longer because of weather conditions, courier delays, operational disruptions, incorrect customer information, public holidays, regional restrictions or other circumstances outside Alongkar&apos;s reasonable control.
              </p>
            </section>

            {/* Section 4 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                4. Shipping Protection
              </h2>
              <p>
                Eligible shipments may receive shipping protection through the applicable logistics or shipping service used for the order.
              </p>
              <p>
                Shipping protection is subject to the eligibility, coverage limits, claim requirements, documentation requirements and other applicable terms of the shipping service or protection programme.
              </p>
              <p>
                Shipping protection does not mean that every type of product complaint is automatically covered.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                5. What Shipping Protection May Cover
              </h2>
              <p>
                Subject to eligibility, verification and the applicable shipping protection terms, Alongkar may assist with claims involving:
              </p>
              <ul className="list-disc pl-5 space-y-2 marker:text-gold-dark">
                <li>Loss of a shipment during transit.</li>
                <li>Damage to the product caused during transit.</li>
                <li>Missing or short items from a shipment.</li>
                <li>An incorrect product being sent by Alongkar.</li>
              </ul>
            </section>

            {/* Section 6 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                6. Lost Shipments
              </h2>
              <p>
                If a shipment is confirmed as lost during transit, Alongkar will investigate the shipment through the applicable logistics partner.
              </p>
              <p>
                Depending on the circumstances, product availability and the applicable shipping protection process, Alongkar may provide a replacement or refund for an eligible order.
              </p>
              <p>
                Any resolution is subject to verification and the applicable claim and protection requirements of the shipping service.
              </p>
            </section>

            {/* Section 7 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                7. Damaged Shipments
              </h2>
              <p>
                If an order arrives damaged, customers should contact Alongkar within 24 hours of delivery.
              </p>
              <p>
                Customers should provide clear photographs of the outer packaging, shipping label, packaging condition and damaged product.
              </p>
              <p>
                Where available, customers are encouraged to provide an unboxing video. An unboxing video is recommended but is not mandatory.
              </p>
              <p>
                Alongkar may investigate the matter and, where the claim is verified and eligible, arrange an appropriate replacement or refund.
              </p>
            </section>

            {/* Section 8 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                8. Missing or Short Items
              </h2>
              <p>
                If an item appears to be missing from a delivered order, customers should contact Alongkar within 24 hours of delivery.
              </p>
              <p>
                Customers may be asked to provide photographs, videos or other information that helps us verify the shipment and its contents.
              </p>
              <p>
                After verification, Alongkar may arrange a replacement or refund for the missing eligible item, subject to applicable shipping protection and claim requirements.
              </p>
            </section>

            {/* Section 9 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                9. Wrong Product Received
              </h2>
              <p>
                If Alongkar sends an incorrect product, customers should contact us within 24 hours of delivery.
              </p>
              <p>
                After verification, Alongkar may arrange a replacement with the correct product where available or provide an appropriate refund.
              </p>
              <p>
                Customers should not use, alter or damage the incorrect product while the issue is being investigated.
              </p>
            </section>

            {/* Section 10 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                10. Package Tampering or Visible Damage
              </h2>
              <p>
                If a package appears visibly damaged, opened or tampered with at the time of delivery, customers should, where reasonably possible, document the condition of the package before opening it.
              </p>
              <p>
                Customers should take photographs of the package, shipping label and visible damage and contact Alongkar as soon as possible.
              </p>
              <p>
                Prompt reporting helps Alongkar and the logistics partner investigate the shipment efficiently.
              </p>
            </section>

            {/* Section 11 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                11. Reporting a Shipping Issue
              </h2>
              <p>
                Customers should report damage, missing items, wrong products or other delivery-related issues to Alongkar within 24 hours of delivery.
              </p>
              <p>
                Claims may require photographs, videos, order details, shipment information or other supporting evidence.
              </p>
              <p>
                Claims are subject to verification and the applicable requirements and timelines of our logistics and shipping partners.
              </p>
              <p>
                Failure to report an issue promptly may make investigation or claim processing more difficult.
              </p>
            </section>

            {/* Section 12 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                12. Incorrect or Incomplete Address
              </h2>
              <p>
                Customers are responsible for providing a complete and accurate delivery address, PIN code and contact information.
              </p>
              <p>
                Alongkar is not responsible for delivery delays, failed delivery or return-to-origin situations caused by incorrect, incomplete or outdated information provided by the customer.
              </p>
              <p>
                If a shipment has to be re-dispatched because of incorrect or incomplete customer-provided information, additional shipping charges may apply.
              </p>
            </section>

            {/* Section 13 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                13. Failed Delivery and Return to Origin
              </h2>
              <p>
                If a courier is unable to deliver an order because the customer is unavailable, the address is incorrect, delivery attempts are unsuccessful, the customer refuses the parcel or another customer-related issue prevents delivery, the shipment may be returned to Alongkar according to the courier&apos;s process.
              </p>
              <p>
                If the customer requests re-shipment after a return-to-origin event caused by customer-related circumstances, additional shipping charges may apply.
              </p>
              <p>
                The availability of re-shipment may depend on the product and circumstances of the order.
              </p>
            </section>

            {/* Section 14 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                14. Cash on Delivery and Delivery Refusal
              </h2>
              <p>
                COD orders may be subject to a ₹10 COD charge.
              </p>
              <p>
                Alongkar may verify COD orders before dispatch.
              </p>
              <p>
                If a customer repeatedly refuses or fails to accept COD shipments, Alongkar may restrict COD availability for that customer and may require prepaid payment for future orders.
              </p>
              <p>
                Alongkar may also cancel suspicious, incomplete or unverified COD orders.
              </p>
            </section>

            {/* Section 15 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                15. What Shipping Protection Does Not Cover
              </h2>
              <p>
                Shipping protection is intended for eligible shipping-related incidents. It does not normally cover:
              </p>
              <ul className="list-disc pl-5 space-y-2 marker:text-gold-dark">
                <li>
                  A customer simply changing their mind after receiving the product. Such matters are governed by the{' '}
                  <Link to="/returns" className="text-gold-dark font-medium hover:underline">
                    7-Day Return Policy
                  </Link>.
                </li>
                <li>Damage caused by the customer after delivery.</li>
                <li>Normal wear and tear of fashion jewellery.</li>
                <li>Natural changes in jewellery colour or finish caused by use, storage, sweat, water, perfume, cosmetics or other environmental exposure.</li>
                <li>Issues caused by incorrect care, misuse, modification or handling of the product after delivery.</li>
                <li>Situations that fall outside the applicable shipping protection or logistics partner&apos;s coverage.</li>
              </ul>
            </section>

            {/* Section 16 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                16. Returns and Refunds
              </h2>
              <p>
                Shipping-related claims and customer-initiated returns are handled differently.
              </p>
              <p>
                If a customer simply changes their mind or wishes to return an eligible product, the request will be handled under Alongkar&apos;s separate{' '}
                <Link to="/returns" className="text-gold-dark font-medium hover:underline">
                  7-Day Return Policy
                </Link>.
              </p>
              <p>
                Where a shipping-related incident results in an approved refund or replacement, the applicable resolution will depend on the nature of the issue, verification and product availability.
              </p>
            </section>

            {/* Section 17 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                17. Shipping Protection and Third-Party Terms
              </h2>
              <p>
                Shipping protection may depend on the logistics partner or protection programme used for a particular shipment.
              </p>
              <p>
                The availability, limits, exclusions, claim process and documentation requirements of such protection are governed by the applicable third-party terms.
              </p>
              <p>
                Alongkar will make reasonable efforts to assist customers with eligible shipping-related claims, but cannot guarantee approval of a claim where the applicable logistics or protection provider determines that the claim does not meet its requirements.
              </p>
            </section>

            {/* Section 18 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                18. Customer Cooperation
              </h2>
              <p>
                Customers may be required to provide photographs, videos, order information, packaging details or other reasonable evidence to help investigate a shipping issue.
              </p>
              <p>
                Customers should retain the product, packaging and shipping materials until the issue has been resolved or Alongkar confirms that they are no longer required.
              </p>
            </section>

            {/* Section 19 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                19. Circumstances Beyond Our Control
              </h2>
              <p>
                Alongkar cannot be held responsible for delivery delays or disruptions caused by circumstances reasonably outside our control, including severe weather, natural events, regional restrictions, public disturbances, courier disruptions, technical failures or other unforeseen events.
              </p>
              <p>
                We will make reasonable efforts to assist customers and communicate relevant updates where practical.
              </p>
            </section>

            {/* Section 20 */}
            <section className="space-y-4">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                20. Contact Us
              </h2>
              <p>
                For shipping-related questions, delivery issues or claims, customers can contact Alongkar using the information below.
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
