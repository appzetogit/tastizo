import React from 'react';
import { Helmet } from 'react-helmet-async';

const BASE_URL = 'https://www.tastizo.com';
const DEFAULT_OG_IMAGE = `${BASE_URL}/tastizo_og_image.png`;

/**
 * SEOHead component to inject meta tags and schemas dynamically
 * 
 * @param {Object} props
 * @param {string} props.title - Title of the page
 * @param {string} props.description - Meta description of the page
 * @param {string} props.canonical - Relative or absolute path for canonical link
 * @param {string} [props.ogTitle] - Optional custom Open Graph title
 * @param {string} [props.ogDescription] - Optional custom Open Graph description
 * @param {string} [props.ogImage] - Absolute path to OG social sharing image
 * @param {string} [props.ogType='website'] - Open Graph type
 * @param {Object|Object[]} [props.jsonLd] - Single JSON-LD object or array of JSON-LD objects
 * @param {boolean} [props.noIndex=false] - Whether to exclude this page from indexation
 */
export default function SEOHead({
  title,
  description,
  canonical,
  ogTitle,
  ogDescription,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  jsonLd,
  noIndex = false,
}) {
  const cleanTitle = title ? `${title}` : 'Tastizo — Order Food Online';
  
  // Format canonical absolute URL
  const canonicalUrl = canonical
    ? canonical.startsWith('http')
      ? canonical
      : `${BASE_URL}${canonical.startsWith('/') ? canonical : `/${canonical}`}`
    : BASE_URL;

  // Render schema tags
  const renderSchemas = () => {
    if (!jsonLd) return null;
    const schemas = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    return schemas.map((schema, idx) => (
      <script key={`jsonld-${idx}`} type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    ));
  };

  return (
    <Helmet>
      {/* Basic Title and Meta */}
      <title>{cleanTitle}</title>
      {description && <meta name="description" content={description} />}
      
      {/* Canonical link */}
      <link rel="canonical" href={canonicalUrl} />

      {/* Robots meta tag */}
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      )}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={ogTitle || cleanTitle} />
      {description && <meta property="og:description" content={ogDescription || description} />}
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content="Tastizo" />
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      {/* Twitter Cards */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogTitle || cleanTitle} />
      {description && <meta name="twitter:description" content={ogDescription || description} />}
      {ogImage && <meta name="twitter:image" content={ogImage} />}
      <meta name="twitter:site" content="@tastizo" />

      {/* Structured Data */}
      {renderSchemas()}
    </Helmet>
  );
}
