import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sms, Location, ArrowLeft } from 'reicon-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';

export const PrivacyPolicyPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Privacy Policy | Alongkar';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        'content',
        'Learn how Alongkar collects, uses, protects and manages personal information.'
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
              Privacy Policy
            </h1>
            <p className="mt-2 text-sm text-espresso-light/80 font-light leading-relaxed">
              How Alongkar collects, uses and protects your information.
            </p>
            <p className="mt-1.5 text-[11px] text-espresso-light/50">
              Last updated: October 7, 2026
            </p>
            <div className="mt-6 h-px bg-gold/20" />
          </header>

          {/* Policy Document Body */}
          <div className="bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft p-6 sm:p-10 lg:p-12 space-y-10 text-xs sm:text-sm leading-relaxed text-espresso-light font-light">
            {/* Introduction */}
            <section className="space-y-3 pb-6 border-b border-gold/15">
              <p>
                This Privacy Policy explains how Alongkar, operated by Snehasish Mondal, collects, uses, stores, protects and shares information when you visit or use alongkar.in, create an account, browse products, add items to your cart or wishlist, place an order, submit a jewellery request, upload an inspiration image, contact us, or otherwise interact with Alongkar.
              </p>
              <p>
                By using Alongkar, you acknowledge the practices described in this Privacy Policy.
              </p>
            </section>

            {/* Section 1 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso flex items-center gap-2">
                <span>1. About Alongkar</span>
              </h2>
              <p>
                Alongkar is an online jewellery and lifestyle store operated by Snehasish Mondal.
              </p>
              <div className="bg-ivory p-4 rounded-brand border border-gold/15 space-y-1.5 text-xs text-espresso">
                <p><span className="font-semibold">Website:</span> alongkar.in</p>
                <p><span className="font-semibold">Email:</span> <a href="mailto:alongkar.official@gmail.com" className="text-gold-dark hover:underline">alongkar.official@gmail.com</a></p>
                <p><span className="font-semibold">Address:</span> Saradapally, Rampurhat, Birbhum, West Bengal, PIN 731224, India.</p>
              </div>
            </section>

            {/* Section 2 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                2. Eligibility and Age
              </h2>
              <p>
                Alongkar&apos;s services are intended for individuals who are 18 years of age or older and capable of entering into legally binding agreements under applicable law.
              </p>
              <p>
                If you are under 18 years of age, you should not create an account, place an order or otherwise provide personal information to Alongkar without appropriate involvement and authorization from a parent or legal guardian where permitted by applicable law.
              </p>
            </section>

            {/* Section 3 */}
            <section className="space-y-4">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                3. Information We Collect
              </h2>
              <p>
                We collect information that is reasonably necessary to operate Alongkar, provide shopping and account functionality, process orders and payments, arrange delivery, provide customer support, process jewellery requests and maintain the security of our services.
              </p>

              <div className="space-y-6 pt-2">
                {/* 3.1 */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-xs sm:text-sm text-espresso">
                    3.1 Personal Information
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-espresso-light">
                    <li>Name</li>
                    <li>Email address</li>
                    <li>Mobile phone number</li>
                    <li>Shipping address</li>
                    <li>Billing address where applicable</li>
                    <li>Account and authentication information</li>
                    <li>Order information</li>
                    <li>Cart information</li>
                    <li>Wishlist information</li>
                    <li>Customer support communications</li>
                    <li>Information voluntarily submitted through forms or jewellery requests</li>
                  </ul>
                </div>

                {/* 3.2 */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-xs sm:text-sm text-espresso">
                    3.2 Shipping and Billing Information
                  </h3>
                  <p>
                    When you place an order, Alongkar may collect the information necessary to process and deliver the order, including recipient name, mobile number, shipping address, billing address where applicable, city, state, country and PIN/postal code.
                  </p>
                </div>

                {/* 3.3 */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-xs sm:text-sm text-espresso">
                    3.3 Order Information
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-espresso-light">
                    <li>Products purchased</li>
                    <li>Product quantities</li>
                    <li>Order value</li>
                    <li>Discounts or promotional offers applied</li>
                    <li>Order date and time</li>
                    <li>Order status</li>
                    <li>Shipping and delivery information</li>
                    <li>Cancellation information</li>
                    <li>Return or exchange information</li>
                    <li>Refund information</li>
                    <li>Replacement information</li>
                  </ul>
                </div>

                {/* 3.4 */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-xs sm:text-sm text-espresso">
                    3.4 Account and Authentication Information
                  </h3>
                  <p>
                    Alongkar uses Clerk as an authentication service. Depending on how you use the Website, information associated with your account may include your name, email address, phone number, authentication identifiers and account-related information necessary to securely provide account functionality.
                  </p>
                </div>

                {/* 3.5 */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-xs sm:text-sm text-espresso">
                    3.5 Cart and Wishlist Information
                  </h3>
                  <p>
                    When you add products to your cart or wishlist, Alongkar may store product identifiers, quantities and information associated with your account so that these features can function correctly.
                  </p>
                </div>

                {/* 3.6 */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-xs sm:text-sm text-espresso">
                    3.6 Jewellery Requests and Inspiration Images
                  </h3>
                  <p>
                    Alongkar may allow customers to submit jewellery requests and upload inspiration or reference images. These images and related information may be collected to understand your requirements, evaluate requested designs, communicate with you and assist with fulfilling your jewellery request.
                  </p>
                  <p className="text-xs italic bg-ivory p-3 rounded border border-gold/15 text-espresso">
                    You should not upload sensitive personal information or images belonging to another person unless you have the appropriate permission to do so.
                  </p>
                </div>

                {/* 3.7 */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-xs sm:text-sm text-espresso">
                    3.7 Payment and Transaction Information
                  </h3>
                  <p>
                    Payments made through Alongkar are processed through Razorpay. Alongkar may receive transaction-related information such as payment status, transaction identifiers, order references, refund information and other information necessary to associate a payment with an order.
                  </p>
                  <p className="text-xs italic bg-ivory p-3 rounded border border-gold/15 text-espresso">
                    Alongkar does not intend to store complete debit-card numbers, credit-card numbers, UPI PINs, banking passwords or similar sensitive payment credentials on its own servers. Payment processing is handled through Razorpay and is subject to the applicable terms, privacy practices and security measures of the payment provider.
                  </p>
                </div>

                {/* 3.8 */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-xs sm:text-sm text-espresso">
                    3.8 Device and Technical Information
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-espresso-light">
                    <li>IP address</li>
                    <li>Browser type and version</li>
                    <li>Device type</li>
                    <li>Operating system</li>
                    <li>Referring page or website</li>
                    <li>Pages visited</li>
                    <li>Date and time of access</li>
                    <li>Website interaction information</li>
                    <li>Error and diagnostic information</li>
                    <li>Other basic technical information necessary to operate and secure the Website</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                4. How We Collect Information
              </h2>
              <ul className="list-disc pl-5 space-y-2 text-espresso-light">
                <li>
                  We may collect information directly from you when you create or use an account, browse or interact with the Website, add products to your cart or wishlist, place an order, submit a form, contact us, submit a jewellery request or upload an image.
                </li>
                <li>
                  Certain technical information may be collected automatically when you use the Website through cookies and similar technologies.
                </li>
                <li>
                  We may also receive information from service providers involved in authentication, payment processing, hosting, image storage, shipping, logistics and other services necessary to operate Alongkar.
                </li>
              </ul>
            </section>

            {/* Section 5 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                5. Cookies and Similar Technologies
              </h2>
              <p>
                Cookies are small data files that websites may store on your device through your browser.
              </p>
              <p>
                Alongkar may use cookies and similar technologies to maintain sessions, support authentication, remember preferences, enable shopping-cart functionality, maintain security, prevent abuse and understand Website performance.
              </p>
              <p>
                Essential cookies may be necessary for certain parts of the Website to function correctly.
              </p>
              <p>
                Preference cookies may help remember settings or choices.
              </p>
              <p>
                Where applicable, performance or analytics technologies may help us understand general Website usage and identify technical problems.
              </p>
              <p>
                You can generally manage or disable cookies through your browser settings. However, disabling certain essential cookies may affect Website functionality.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                6. How We Use Your Information
              </h2>
              <p>We may use the information we collect for the following purposes:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-espresso-light">
                <li>Create and manage customer accounts.</li>
                <li>Authenticate users and maintain secure sessions.</li>
                <li>Process and fulfil orders.</li>
                <li>Process and verify payments.</li>
                <li>Arrange shipping and delivery.</li>
                <li>Manage carts and wishlists.</li>
                <li>Process jewellery and customization requests.</li>
                <li>Process customer-uploaded inspiration images.</li>
                <li>Provide customer support.</li>
                <li>Send order confirmations and service-related communications.</li>
                <li>Send payment and shipping updates.</li>
                <li>Handle returns, exchanges, replacements and refunds.</li>
                <li>Prevent fraud, abuse and unauthorized activity.</li>
                <li>Maintain the security and integrity of the Website.</li>
                <li>Troubleshoot technical problems.</li>
                <li>Improve Website performance and user experience.</li>
                <li>Improve products and services.</li>
                <li>Understand general Website usage and customer preferences.</li>
                <li>Comply with applicable legal and regulatory requirements.</li>
                <li>Establish, exercise or defend legal rights where necessary.</li>
              </ul>
            </section>

            {/* Section 7 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                7. Sharing of Your Personal Information
              </h2>
              <p className="font-medium text-espresso">
                Alongkar does not sell your personal information.
              </p>
              <p>
                We may share information with trusted service providers where reasonably necessary to provide, operate, secure or improve our services.
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-espresso-light">
                <li>Payment-related information may be processed by Razorpay.</li>
                <li>Authentication-related information may be processed by Clerk.</li>
                <li>Application and database information may be processed or stored through infrastructure and database service providers used by Alongkar.</li>
                <li>Customer-uploaded images may be processed or stored through Cloudinary.</li>
                <li>Necessary delivery information may be shared with shipping and logistics partners so that orders can be delivered.</li>
              </ul>
              <p>
                We may also disclose information where required by applicable law, lawful government request, court order or legal process, or where reasonably necessary to protect the rights, property, safety or security of Alongkar, our users or others.
              </p>
            </section>

            {/* Section 8 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                8. Third-Party Service Providers
              </h2>
              <p>
                Alongkar relies on certain third-party service providers to operate parts of its Website and services.
              </p>
              <p>
                These providers may process information on behalf of Alongkar for purposes such as authentication, payment processing, database and infrastructure services, image storage and delivery.
              </p>
              <p>
                We aim to use service providers that maintain appropriate security and privacy practices for the services they provide.
              </p>
              <p>
                Third-party providers may have their own privacy policies and terms governing their handling of information.
              </p>
            </section>

            {/* Section 9 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                9. Data Security
              </h2>
              <p>
                Alongkar takes reasonable technical and organizational measures designed to protect personal information against unauthorized access, misuse, loss, alteration, disclosure or destruction.
              </p>
              <p>
                Depending on the service and type of information involved, security measures may include HTTPS/TLS encryption, authentication controls, access controls, restricted administrative access, secure database practices, server-side validation and secure handling of application credentials.
              </p>
              <p>
                No Internet transmission or electronic storage system can be guaranteed to be completely secure. Accordingly, while Alongkar takes reasonable measures to protect information, we cannot guarantee absolute security.
              </p>
            </section>

            {/* Section 10 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                10. Data Retention
              </h2>
              <p>
                Alongkar retains personal information only for as long as reasonably necessary for the purposes described in this Privacy Policy.
              </p>
              <p>
                Information may be retained for purposes including maintaining accounts, completing transactions, processing returns or refunds, resolving disputes, providing customer support, preventing fraud, complying with legal, accounting or tax requirements and establishing or defending legal rights.
              </p>
              <p>
                Certain transaction and business records may need to be retained for longer periods where required by applicable law.
              </p>
              <p>
                When information is no longer reasonably required, it may be deleted, anonymized or securely disposed of, subject to applicable legal and operational requirements.
              </p>
            </section>

            {/* Section 11 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                11. Your Rights and Choices
              </h2>
              <p>
                Subject to applicable law, you may have rights relating to your personal information, including requesting access to information we hold about you, requesting correction of inaccurate information, requesting deletion where legally permitted, withdrawing consent where processing is based on consent, and raising privacy-related concerns or complaints.
              </p>
              <p>
                Some requests may be subject to legal, security, contractual or other applicable limitations.
              </p>
              <p>
                We may need to verify your identity before processing certain requests.
              </p>
              <p>
                To make a privacy-related request, contact us at <a href="mailto:alongkar.official@gmail.com" className="text-gold-dark font-medium hover:underline">alongkar.official@gmail.com</a>.
              </p>
            </section>

            {/* Section 12 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                12. Children&apos;s Privacy
              </h2>
              <p>
                Alongkar&apos;s services are intended for individuals who are 18 years of age or older.
              </p>
              <p>
                We do not knowingly seek to collect personal information from children under 18 for the purpose of allowing them to independently use our services.
              </p>
              <p>
                If a parent or legal guardian believes that personal information of a child has been provided to Alongkar improperly, they may contact us at <a href="mailto:alongkar.official@gmail.com" className="text-gold-dark font-medium hover:underline">alongkar.official@gmail.com</a>.
              </p>
            </section>

            {/* Section 13 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                13. Marketing Communications
              </h2>
              <p>
                Alongkar may send promotional or marketing communications where permitted by applicable law.
              </p>
              <p>
                Such communications may include information about new products, jewellery collections, offers, discounts, campaigns or other Alongkar services.
              </p>
              <p>
                You may opt out of promotional communications by following the unsubscribe instructions provided in the relevant communication, where available, or by contacting <a href="mailto:alongkar.official@gmail.com" className="text-gold-dark font-medium hover:underline">alongkar.official@gmail.com</a>.
              </p>
              <p>
                Even if you opt out of promotional communications, Alongkar may continue to send necessary transactional or service-related communications such as order confirmations, payment updates, shipping notifications, security alerts and important account information.
              </p>
            </section>

            {/* Section 14 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                14. Third-Party Websites and Services
              </h2>
              <p>
                The Alongkar Website may contain links to third-party websites, platforms or services.
              </p>
              <p>
                Third-party services operate independently and may have their own privacy policies and terms.
              </p>
              <p>
                Alongkar does not control the privacy practices of third-party websites and encourages users to review their applicable privacy policies before providing personal information.
              </p>
            </section>

            {/* Section 15 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                15. International Data Processing
              </h2>
              <p>
                Some third-party service providers used by Alongkar may process or store information on servers located outside India.
              </p>
              <p>
                Where information is processed through such providers, Alongkar takes reasonable steps to use service providers with appropriate security and privacy safeguards and to comply with applicable legal requirements.
              </p>
            </section>

            {/* Section 16 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                16. Changes to This Privacy Policy
              </h2>
              <p>
                Alongkar may update this Privacy Policy from time to time to reflect changes in our services, technology, data-processing practices, security practices or applicable legal requirements.
              </p>
              <p>
                When changes are made, the Last Updated date at the top of this page will be updated.
              </p>
              <p>
                We encourage users to periodically review this page to remain informed about how Alongkar handles personal information.
              </p>
            </section>

            {/* Section 17 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                17. Contact Us
              </h2>
              <p>
                If you have questions, requests, concerns or complaints regarding this Privacy Policy or Alongkar&apos;s handling of personal information, please contact us:
              </p>
              <div className="bg-ivory p-5 rounded-brand border border-gold/15 space-y-2 text-xs text-espresso">
                <p className="font-bold text-sm text-espresso">Alongkar</p>
                <p><span className="font-semibold">Operated by:</span> Snehasish Mondal</p>
                <p className="flex items-center gap-1.5">
                  <Sms size={14} className="text-gold-dark" />
                  <span className="font-semibold">Email:</span>
                  <a href="mailto:alongkar.official@gmail.com" className="text-gold-dark hover:underline">
                    alongkar.official@gmail.com
                  </a>
                </p>
                <p className="flex items-start gap-1.5">
                  <Location size={14} className="text-gold-dark shrink-0 mt-0.5" />
                  <span>
                    <span className="font-semibold">Address:</span> Saradapally, Rampurhat, Birbhum, West Bengal, PIN 731224, India.
                  </span>
                </p>
              </div>
            </section>

            {/* Section 18 */}
            <section className="space-y-3">
              <h2 className="font-serif text-base sm:text-lg font-bold text-espresso">
                18. Privacy and Grievance Contact
              </h2>
              <p>
                For privacy-related questions, requests, complaints or concerns, please contact:
              </p>
              <div className="bg-ivory p-5 rounded-brand border border-gold/15 space-y-2 text-xs text-espresso">
                <p className="font-bold text-sm text-espresso">Alongkar</p>
                <p className="flex items-center gap-1.5">
                  <Sms size={14} className="text-gold-dark" />
                  <span className="font-semibold">Email:</span>
                  <a href="mailto:alongkar.official@gmail.com" className="text-gold-dark hover:underline">
                    alongkar.official@gmail.com
                  </a>
                </p>
                <p className="text-espresso-light text-xs pt-1">
                  We may verify relevant information before processing requests concerning personal data or account information.
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>
    </StorefrontLayout>
  );
};
