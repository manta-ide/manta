import { useState, ChangeEvent, FormEvent } from 'react'
import { cn } from '../lib/utils'

interface ContactFormData {
  name: string
  email: string
  message: string
}

interface ContactFormErrors {
  name?: string
  email?: string
  message?: string
}

/**
 * ContactForm
 *
 * A responsive, accessible contact form with validation for name, email, and message fields.
 */
export const ContactForm = () => {
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    message: '',
  })
  const [errors, setErrors] = useState<ContactFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const validateField = (field: keyof ContactFormData, value: string): string | undefined => {
    if (!value.trim()) {
      return `${field.charAt(0).toUpperCase() + field.slice(1)} is required.`
    }
    if (field === 'email') {
      const emailRegex = /^[\w-.]+@[\w-]+\.[a-zA-Z]{2,}$/
      if (!emailRegex.test(value)) {
        return 'Enter a valid email address.'
      }
    }
    return undefined
  }

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name as keyof ContactFormErrors]) {
      const newError = validateField(name as keyof ContactFormData, value)
      setErrors((prev) => ({ ...prev, [name]: newError }))
    }
  }

  const validateAll = () => {
    const newErrors: ContactFormErrors = {}
    (Object.keys(formData) as (keyof ContactFormData)[]).forEach((field) => {
      const error = validateField(field, formData[field])
      if (error) {
        newErrors[field] = error
      }
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validateAll()) return

    setIsSubmitting(true)
    try {
      // TODO: Replace with real API submission
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setIsSubmitted(true)
      setFormData({ name: '', email: '', message: '' })
      setErrors({})
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="max-w-xl mx-auto p-6 bg-white rounded-lg shadow-md"
    >
      {isSubmitted && (
        <div
          role="status"
          className="mb-4 p-3 bg-green-100 text-green-800 rounded"
        >
          Thank you! Your message has been sent.
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          aria-invalid={errors.name ? 'true' : 'false'}
          aria-describedby={errors.name ? 'name-error' : undefined}
          className={cn(
            'mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:border-transparent',
            errors.name
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:ring-primary'
          )}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600" id="name-error" role="alert">
            {errors.name}
          </p>
        )}
      </div>

      <div className="mb-4">
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          aria-invalid={errors.email ? 'true' : 'false'}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={cn(
            'mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:border-transparent',
            errors.email
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:ring-primary'
          )}
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600" id="email-error" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <div className="mb-4">
        <label htmlFor="message" className="block text-sm font-medium text-gray-700">
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          value={formData.message}
          onChange={handleChange}
          required
          aria-invalid={errors.message ? 'true' : 'false'}
          aria-describedby={errors.message ? 'message-error' : undefined}
          className={cn(
            'mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:border-transparent',
            errors.message
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:ring-primary'
          )}
        />
        {errors.message && (
          <p className="mt-1 text-sm text-red-600" id="message-error" role="alert">
            {errors.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          'w-full py-2 px-4 bg-primary text-white font-medium rounded-md shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition',
          isSubmitting && 'opacity-50 cursor-not-allowed'
        )}
      >
        {isSubmitting ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  )
}

export default ContactForm
