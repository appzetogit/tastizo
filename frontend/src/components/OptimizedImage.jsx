import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'

const isCloudinary = (imageSrc) =>
  typeof imageSrc === 'string' && imageSrc.includes('res.cloudinary.com')

/** Signed or tokenized URLs break if we append resize/query params */
const mustUseOriginalUrl = (imageSrc) => {
  if (!imageSrc || typeof imageSrc !== 'string') return true
  return /[?&](X-Amz-|Signature|sig=|token=|Policy=)/i.test(imageSrc) || /AWSAccessKeyId/i.test(imageSrc)
}

// Cloudinary path transforms only (safe). Do not append ?w= to arbitrary hosts — breaks S3, APIs, etc.
const buildOptimizedUrl = (imageSrc, width, useWebP = false) => {
  if (!isCloudinary(imageSrc)) return imageSrc
  const transform = `w_${width},q_75${useWebP ? ',f_webp' : ''}`
  const replaced = imageSrc.replace(
    /\/upload\/(?:[^/]*\/)?(v\d+\/)/,
    `/upload/${transform}/$1`
  )
  return replaced !== imageSrc ? replaced : imageSrc
}

const supportsResponsiveVariants = (imageSrc) => {
  if (!imageSrc || typeof imageSrc !== 'string' || imageSrc === '') return false
  if (imageSrc.startsWith('data:') || imageSrc.startsWith('/')) return false
  if (!/^https?:\/\//.test(imageSrc)) return false
  if (mustUseOriginalUrl(imageSrc)) return false
  return isCloudinary(imageSrc)
}

const OptimizedImage = React.memo(({
  src,
  alt,
  className = '',
  priority = false,
  sizes = '100vw',
  objectFit = 'cover',
  placeholder = 'blur',
  observerRootMargin = '120px',
  blurDataURL,
  onLoad,
  onError,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [plainFallback, setPlainFallback] = useState(false)
  const [isInView, setIsInView] = useState(priority)
  const imgRef = useRef(null)
  const observerRef = useRef(null)

  useEffect(() => {
    setPlainFallback(false)
    setHasError(false)
    setIsLoaded(false)
    if (priority) setIsInView(true)
  }, [src, priority])

  const sizesArr = useMemo(() => {
    const isSmall = /6[4-9]px|7[0-9]px|8[0-9]px|9[0-6]px/.test(sizes)
    return isSmall ? [128, 200, 400, 600, 800] : [200, 400, 600, 800, 1200, 1600]
  }, [sizes])

  const useVariants = supportsResponsiveVariants(src) && !plainFallback

  const srcSet = useMemo(() => {
    if (!useVariants) return undefined
    return sizesArr.map((size) => `${buildOptimizedUrl(src, size, false)} ${size}w`).join(', ')
  }, [src, sizesArr, useVariants])

  const webPSrcSet = useMemo(() => {
    if (!useVariants) return undefined
    return sizesArr.map((size) => `${buildOptimizedUrl(src, size, true)} ${size}w`).join(', ')
  }, [src, sizesArr, useVariants])

  useEffect(() => {
    if (priority || isInView) return

    const node = imgRef.current
    if (!node) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true)
            if (observerRef.current && node) {
              observerRef.current.unobserve(node)
            }
          }
        })
      },
      {
        rootMargin: observerRootMargin,
        threshold: 0,
      }
    )

    observerRef.current.observe(node)

    return () => {
      if (observerRef.current && node) {
        observerRef.current.unobserve(node)
      }
    }
  }, [priority, isInView, observerRootMargin])

  useEffect(() => {
    if (!priority || !src || src.startsWith('data:')) return
    if (!/^https?:\/\//.test(src)) return
    const href = isCloudinary(src) ? buildOptimizedUrl(src, 400, true) : src
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = href
    link.fetchPriority = 'high'
    document.head.appendChild(link)
    return () => {
      link.remove()
    }
  }, [priority, src])

  const handleLoad = useCallback(
    (e) => {
      setIsLoaded(true)
      onLoad?.(e)
    },
    [onLoad]
  )

  const handleError = useCallback(
    (e) => {
      if (!plainFallback && useVariants) {
        setPlainFallback(true)
        setIsLoaded(false)
        return
      }
      setHasError(true)
      onError?.(e)
    },
    [plainFallback, useVariants, onError]
  )

  const defaultBlurDataURL =
    blurDataURL ||
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U1ZTdlYiIvPjwvc3ZnPg=='

  if (!src || src === '') {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <span className="text-xs text-gray-400 dark:text-gray-600">Image unavailable</span>
        </div>
      </div>
    )
  }

  const imageSrc = hasError
    ? 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23e5e7eb" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle"%3EImage not found%3C/text%3E%3C/svg%3E'
    : src

  const imgClass = `w-full h-full ${objectFit === 'cover' ? 'object-cover' : objectFit === 'contain' ? 'object-contain' : ''} ${priority || isLoaded ? 'opacity-100' : 'opacity-0'} ${!priority && 'transition-opacity duration-300'}`

  return (
    <div className={`relative overflow-hidden ${className}`} ref={imgRef}>
      {placeholder === 'blur' && !isLoaded && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 1 }}
          animate={{ opacity: isLoaded ? 0 : 1 }}
          transition={{ duration: 0.3 }}
          style={{
            backgroundImage: `url(${defaultBlurDataURL})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
          }}
        />
      )}

      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 animate-pulse" />
      )}

      {isInView &&
        (webPSrcSet ? (
          <picture className="absolute inset-0 w-full h-full" key={plainFallback ? 'p1' : 'p0'}>
            <source srcSet={webPSrcSet} sizes={sizes} type="image/webp" />
            <motion.img
              src={imageSrc}
              srcSet={srcSet}
              sizes={sizes}
              alt={alt}
              className={imgClass}
              loading="eager"
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              onLoad={handleLoad}
              onError={handleError}
              {...props}
            />
          </picture>
        ) : (
          <motion.img
            key={plainFallback ? 'plain' : 'raw'}
            src={imageSrc}
            alt={alt}
            className={`absolute inset-0 ${imgClass}`}
            loading="eager"
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={handleLoad}
            onError={handleError}
            {...props}
          />
        ))}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 z-[1]">
          <span className="text-xs text-gray-400 dark:text-gray-600">Image unavailable</span>
        </div>
      )}
    </div>
  )
})

export default OptimizedImage
