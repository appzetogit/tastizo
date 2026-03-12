import axios from "axios";
import dotenv from "dotenv";

// Load environment variables if not already loaded
dotenv.config();

/**
 * SMSIndia Hub SMS Service for DriveOn
 * Handles OTP sending via SMSIndia Hub API
 * Same service as CreateBharat project
 */
class SMSIndiaHubService {
  constructor() {
    // Credentials will be loaded from database dynamically
    this.apiKey = null;
    this.senderId = null;
    this.baseUrl = "https://cloud.smsindiahub.in/vendorsms/pushsms.aspx";
    this.initializeCredentials();
  }

  async initializeCredentials() {
    const { getSMSHubIndiaCredentials } =
      await import("../../../shared/utils/envService.js");
    const creds = await getSMSHubIndiaCredentials();
    this.apiKey =
      creds.apiKey?.trim() || process.env.SMSINDIAHUB_API_KEY?.trim();
    this.senderId =
      creds.senderId?.trim() || process.env.SMSINDIAHUB_SENDER_ID?.trim();

    // Log configuration status (only in development)
    if (process.env.NODE_ENV === "development") {
      if (!this.apiKey || !this.senderId) {
        console.warn(
          "⚠️ SMSIndia Hub credentials not configured. SMS functionality will be disabled.",
        );
        console.warn(
          "   Please check SMSINDIAHUB_API_KEY and SMSINDIAHUB_SENDER_ID in .env file",
        );
      } else {
      }
    }
  }

  /**
   * Get company name from business settings
   */
  async getCompanyName() {
    try {
      const BusinessSettings = (
        await import("../../admin/models/BusinessSettings.js")
      ).default;
      const settings = await BusinessSettings.getSettings();
      return settings?.companyName || "Tastizo";
    } catch (error) {
      return "Tastizo";
    }
  }

  /**
   * Check if SMSIndia Hub is properly configured
   * @returns {boolean}
   */
  async isConfigured() {
    // Load credentials dynamically from database
    const { getSMSHubIndiaCredentials } =
      await import("../../../shared/utils/envService.js");
    const creds = await getSMSHubIndiaCredentials();
    const apiKey = (
      this.apiKey ||
      creds.apiKey ||
      process.env.SMSINDIAHUB_API_KEY
    )?.trim();
    const senderId = (
      this.senderId ||
      creds.senderId ||
      process.env.SMSINDIAHUB_SENDER_ID
    )?.trim();

    return !!(apiKey && senderId);
  }

  /**
   * Normalize phone number to Indian format with country code
   * @param {string} phone - Phone number to normalize
   * @returns {string} - Normalized phone number with country code (91XXXXXXXXXX)
   */
  normalizePhoneNumber(phone) {
    // Remove all non-digit characters
    const digits = phone.replace(/[^0-9]/g, "");

    // If it already has country code 91 and is 12 digits, return as is
    if (digits.startsWith("91") && digits.length === 12) {
      return digits;
    }

    // If it's 10 digits, add country code 91
    if (digits.length === 10) {
      return "91" + digits;
    }

    // If it's 11 digits and starts with 0, remove the 0 and add country code
    if (digits.length === 11 && digits.startsWith("0")) {
      return "91" + digits.substring(1);
    }

    // Return with country code as fallback
    return "91" + digits.slice(-10);
  }

  /**
   * Send OTP via SMS using SMSIndia Hub
   * @param {string} phone - Phone number to send SMS to
   * @param {string} otp - OTP code to send
   * @param {string} purpose - Purpose of OTP (register, login, reset_password) - optional
   * @returns {Promise<Object>} - Response object
   */
  async sendOTP(phone, otp, purpose = "register") {
    try {
      // Load credentials dynamically from database
      const { getSMSHubIndiaCredentials } =
        await import("../../../shared/utils/envService.js");
      const creds = await getSMSHubIndiaCredentials();
      const apiKey = (
        this.apiKey ||
        creds.apiKey ||
        process.env.SMSINDIAHUB_API_KEY
      )?.trim();
      const senderId = (
        this.senderId ||
        creds.senderId ||
        process.env.SMSINDIAHUB_SENDER_ID
      )?.trim();

      if (!apiKey || !senderId) {
        console.error("❌ SMSIndia Hub Configuration Error:");
        console.error(
          "   SMSINDIAHUB_API_KEY:",
          apiKey ? "✓ Set" : "✗ Missing",
        );
        console.error(
          "   SMSINDIAHUB_SENDER_ID:",
          senderId ? "✓ Set" : "✗ Missing",
        );
        throw new Error(
          "OTP service is not configured. Please contact support.",
        );
      }

      const normalizedPhone = this.normalizePhoneNumber(phone);

      // Validate phone number (should be 12 digits with country code)
      if (normalizedPhone.length !== 12 || !normalizedPhone.startsWith("91")) {
        throw new Error(
          "Invalid mobile number. Please enter a valid 10-digit Indian number.",
        );
      }

      // SMSIndia Hub requires DLT registered templates for transactional SMS
      // The message text MUST match the registered DLT template EXACTLY
      // Check if custom message template is provided (must match registered DLT template exactly)
      const customTemplate = process.env.SMSINDIAHUB_MESSAGE_TEMPLATE?.trim();

      // Check if template ID is provided (for DLT registered templates)
      const templateId = process.env.SMSINDIAHUB_TEMPLATE_ID?.trim();

      // Check if promotional SMS is enabled (temporary workaround for template issues)
      // ⚠️ WARNING: Promotional SMS is not recommended for OTP - use only for testing
      const usePromotional = process.env.SMSINDIAHUB_USE_PROMOTIONAL === "true";
      // Always use transactional SMS (gwid=2) like RentYatra, unless promotional is explicitly enabled
      const gatewayId = usePromotional ? "1" : "2"; // 1 = promotional, 2 = transactional

      if (usePromotional) {
        console.warn(
          "⚠️ Using promotional SMS mode - not recommended for production OTP!",
        );
      }

      // For transactional SMS (DLT), message must match registered template EXACTLY
      // Use fixed template text that matches DLT registration, regardless of purpose
      // Based on working template: "Welcome to the DriveOn powered by SMSINDIAHUB. Your OTP for registration is {otp}"
      let message;
      if (customTemplate) {
        // Use custom template with OTP replacement only (don't change purpose text for DLT)
        message = customTemplate.replace("{otp}", otp);
      } else if (usePromotional) {
        // For promotional SMS, we can use dynamic purpose text
        let purposeText = "registration";
        if (purpose === "login") {
          purposeText = "login";
        } else if (purpose === "reset_password") {
          purposeText = "password reset";
        }
        const companyName = await this.getCompanyName();
        message = `Welcome to the ${companyName} powered by SMSINDIAHUB. Your OTP for ${purposeText} is ${otp}`;
      } else {
        // For transactional SMS, use fixed template text that matches DLT registration
        // IMPORTANT: This must match the registered DLT template exactly
        const companyName = await this.getCompanyName();
        message = `Welcome to the ${companyName} powered by SMSINDIAHUB. Your OTP for registration is ${otp}`;
      }

      // Build the API URL with query parameters (same format as RentYatra)
      const params = new URLSearchParams({
        APIKey: apiKey,
        msisdn: normalizedPhone,
        sid: senderId,
        msg: message,
        fl: "0", // Flash message flag (0 = normal SMS)
        dc: "0", // Delivery confirmation (0 = no confirmation)
        gwid: gatewayId, // Gateway ID (2 = transactional, same as RentYatra)
      });

      // Add template ID if provided (required for some DLT templates)
      if (templateId) {
        params.append("templateid", templateId);
      }

      const apiUrl = `${this.baseUrl}?${params.toString()}`;

      const requestOptions = {
        headers: {
          "User-Agent": "DriveOn/1.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 15000, // 15 second timeout
      };

      // Make GET request with one retry on network/timeout errors
      let response;
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          response = await axios.get(apiUrl, requestOptions);
          break;
        } catch (err) {
          const retryable = [
            "ECONNABORTED",
            "ENOTFOUND",
            "ECONNREFUSED",
            "ECONNRESET",
          ].includes(err.code);
          if (attempt < maxAttempts && retryable) {
            console.warn(
              `SMS send attempt ${attempt} failed (${err.code}), retrying in 1.5s...`,
            );
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          throw err;
        }
      }
      // SMSIndia Hub can return JSON or plain text response
      let responseData = response.data;
      const responseText =
        typeof responseData === "string"
          ? responseData
          : JSON.stringify(responseData);
      // Try to parse as JSON first (SMSIndia Hub sometimes returns JSON)
      let parsedResponse = null;
      if (typeof responseData === "string") {
        try {
          parsedResponse = JSON.parse(responseData);
        } catch (e) {
          // Not JSON, continue with string check
        }
      } else if (typeof responseData === "object") {
        parsedResponse = responseData;
      }

      // Check JSON response for error codes (like ErrorCode: "006" for template error)
      if (parsedResponse && typeof parsedResponse === "object") {
        if (
          parsedResponse.ErrorCode === "000" &&
          parsedResponse.ErrorMessage === "Done"
        ) {
          const messageId =
            parsedResponse.MessageData && parsedResponse.MessageData[0]
              ? parsedResponse.MessageData[0].MessageId
              : `sms_${Date.now()}`;
          return {
            success: true,
            messageId: messageId,
            jobId: parsedResponse.JobId,
            status: "sent",
            to: normalizedPhone,
            body: message,
            provider: "SMSIndia Hub",
            response: parsedResponse,
          };
        } else if (
          parsedResponse.ErrorCode &&
          parsedResponse.ErrorCode !== "000"
        ) {
          const errorMsg = parsedResponse.ErrorMessage || "Unknown error";
          const code = parsedResponse.ErrorCode;
          console.error("❌ SMS failed - JSON error response:", parsedResponse);
          // User-friendly messages for common DLT/API issues
          const userMsg =
            code === "006" || errorMsg.toLowerCase().includes("template")
              ? "OTP could not be sent. Your DLT template may not match the message. Please contact support."
              : code === "001" || errorMsg.toLowerCase().includes("invalid") || errorMsg.toLowerCase().includes("auth")
                ? "OTP service is misconfigured. Please contact support."
                : `OTP could not be sent. Please check your mobile number and try again. (${errorMsg})`;
          throw new Error(userMsg);
        }
      }

      // Check for success indicators in text response (same logic as RentYatra)
      if (
        responseText.includes("success") ||
        responseText.includes("sent") ||
        responseText.includes("accepted")
      ) {
        return {
          success: true,
          messageId: `sms_${Date.now()}`,
          status: "sent",
          to: normalizedPhone,
          body: message,
          provider: "SMSIndia Hub",
          response: responseText,
        };
      } else if (
        responseText.includes("error") ||
        responseText.includes("failed") ||
        responseText.includes("invalid")
      ) {
        console.error(
          "❌ SMS failed - error indicator found in text:",
          responseText,
        );
        throw new Error(
          "OTP could not be sent. Please check your mobile number and try again, or contact support.",
        );
      } else {
        // Ambiguous response = provider did not confirm success; treat as failure so user is not left without OTP
        console.error(
          "❌ SMS ambiguous response (not confirmed) - raw response:",
          responseText,
        );
        console.error(
          "❌ SMS India Hub may have rejected the message (DLT/template/sender). Check API key, sender ID, and DLT template.",
        );
        throw new Error(
          "OTP could not be sent. Please try again or contact support.",
        );
      }
    } catch (error) {
      // Handle specific error cases with user-friendly messages
      if (error.response) {
        const errorData = error.response.data;

        if (error.response.status === 401) {
          throw new Error(
            "OTP service is misconfigured. Please contact support.",
          );
        } else if (error.response.status === 400) {
          throw new Error(
            "OTP could not be sent. Please check your mobile number and try again.",
          );
        } else if (error.response.status === 429) {
          throw new Error(
            "Too many OTP requests. Please try again after a few minutes.",
          );
        } else if (error.response.status === 500) {
          throw new Error("OTP service is temporarily unavailable. Please try again in a moment.");
        } else {
          throw new Error(
            "OTP could not be sent. Please try again or contact support.",
          );
        }
      } else if (error.code === "ECONNABORTED") {
        throw new Error("OTP request timed out. Please try again.");
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        throw new Error(
          "Could not reach OTP service. Please check your connection and try again.",
        );
      } else if (error.code === "ECONNRESET") {
        throw new Error("OTP request was interrupted. Please try again.");
      }

      throw new Error(
        "OTP could not be sent. Please try again or contact support.",
      );
    }
  }

  /**
   * Send custom SMS message
   * @param {string} phone - Phone number to send SMS to
   * @param {string} message - Custom message to send
   * @returns {Promise<Object>} - Response object
   */
  async sendCustomSMS(phone, message) {
    try {
      // Load credentials dynamically from database
      const { getSMSHubIndiaCredentials } =
        await import("../../../shared/utils/envService.js");
      const creds = await getSMSHubIndiaCredentials();
      const apiKey = (
        this.apiKey ||
        creds.apiKey ||
        process.env.SMSINDIAHUB_API_KEY
      )?.trim();
      const senderId = (
        this.senderId ||
        creds.senderId ||
        process.env.SMSINDIAHUB_SENDER_ID
      )?.trim();

      if (!apiKey || !senderId) {
        console.error("❌ SMSIndia Hub Configuration Error:");
        console.error(
          "   SMSINDIAHUB_API_KEY:",
          apiKey ? "✓ Set" : "✗ Missing",
        );
        console.error(
          "   SMSINDIAHUB_SENDER_ID:",
          senderId ? "✓ Set" : "✗ Missing",
        );
        throw new Error(
          "OTP service is not configured. Please contact support.",
        );
      }

      const normalizedPhone = this.normalizePhoneNumber(phone);

      // Validate phone number (should be 12 digits with country code)
      if (normalizedPhone.length !== 12 || !normalizedPhone.startsWith("91")) {
        throw new Error(
          "Invalid mobile number. Please enter a valid 10-digit Indian number.",
        );
      }

      // Build the API URL with query parameters
      const params = new URLSearchParams({
        APIKey: apiKey,
        msisdn: normalizedPhone,
        sid: senderId,
        msg: message,
        fl: "0", // Flash message flag (0 = normal SMS)
        dc: "0", // Delivery confirmation (0 = no confirmation)
        gwid: "2", // Gateway ID (2 = transactional)
      });

      const apiUrl = `${this.baseUrl}?${params.toString()}`;

      // Make GET request to SMSIndia Hub API
      const response = await axios.get(apiUrl, {
        headers: {
          "User-Agent": "DriveOn/1.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 15000, // 15 second timeout
      });

      const responseText = response.data.toString();

      // Check for success indicators in the response
      if (
        responseText.includes("success") ||
        responseText.includes("sent") ||
        responseText.includes("accepted")
      ) {
        return {
          success: true,
          messageId: `sms_${Date.now()}`,
          status: "sent",
          to: normalizedPhone,
          body: message,
          provider: "SMSIndia Hub",
          response: responseText,
        };
      } else if (
        responseText.includes("error") ||
        responseText.includes("failed") ||
        responseText.includes("invalid")
      ) {
        throw new Error(`SMSIndia Hub API error: ${responseText}`);
      } else {
        return {
          success: true,
          messageId: `sms_${Date.now()}`,
          status: "sent",
          to: normalizedPhone,
          body: message,
          provider: "SMSIndia Hub",
          response: responseText,
        };
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Test SMSIndia Hub API connection and credentials
   * @returns {Promise<Object>} - Test result
   */
  async testConnection() {
    try {
      // Load credentials dynamically from database
      const { getSMSHubIndiaCredentials } =
        await import("../../../shared/utils/envService.js");
      const creds = await getSMSHubIndiaCredentials();
      const apiKey = (
        this.apiKey ||
        creds.apiKey ||
        process.env.SMSINDIAHUB_API_KEY
      )?.trim();
      const senderId = (
        this.senderId ||
        creds.senderId ||
        process.env.SMSINDIAHUB_SENDER_ID
      )?.trim();

      if (!apiKey || !senderId) {
        console.error("❌ SMSIndia Hub Configuration Error:");
        console.error(
          "   SMSINDIAHUB_API_KEY:",
          apiKey ? "✓ Set" : "✗ Missing",
        );
        console.error(
          "   SMSINDIAHUB_SENDER_ID:",
          senderId ? "✓ Set" : "✗ Missing",
        );
        throw new Error(
          "OTP service is not configured. Please contact support.",
        );
      }

      // Test with a simple SMS to verify connection
      const testPhone = "919109992290"; // Use a test phone number
      const testMessage =
        "Test message from DriveOn. SMS service is working correctly.";

      const params = new URLSearchParams({
        APIKey: apiKey,
        msisdn: testPhone,
        sid: senderId,
        msg: testMessage,
        fl: "0",
        dc: "0",
        gwid: "2",
      });

      const testUrl = `${this.baseUrl}?${params.toString()}`;

      const response = await axios.get(testUrl, {
        headers: {
          "User-Agent": "DriveOn/1.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 10000,
      });

      return {
        success: true,
        message: "SMSIndia Hub connection successful",
        response: response.data.toString(),
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Get account balance from SMSIndia Hub
   * @returns {Promise<Object>} - Balance information
   */
  async getBalance() {
    try {
      // Load credentials dynamically from database
      const { getSMSHubIndiaCredentials } =
        await import("../../../shared/utils/envService.js");
      const creds = await getSMSHubIndiaCredentials();
      const apiKey = (
        this.apiKey ||
        creds.apiKey ||
        process.env.SMSINDIAHUB_API_KEY
      )?.trim();

      if (!apiKey) {
        console.error("❌ SMSIndia Hub Configuration Error:");
        console.error(
          "   SMSINDIAHUB_API_KEY:",
          apiKey ? "✓ Set" : "✗ Missing",
        );
        throw new Error(
          "OTP service is not configured. Please contact support.",
        );
      }

      // SMSIndia Hub balance API endpoint
      const balanceUrl = `http://cloud.smsindiahub.in/vendorsms/checkbalance.aspx?APIKey=${apiKey}`;

      const response = await axios.get(balanceUrl, {
        headers: {
          "User-Agent": "DriveOn/1.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 10000,
      });

      const responseText = response.data.toString();

      // Parse balance from response (SMSIndia Hub typically returns balance as text)
      const balanceMatch = responseText.match(/(\d+\.?\d*)/);
      const balance = balanceMatch ? parseFloat(balanceMatch[1]) : 0;

      return {
        success: true,
        balance: balance,
        currency: "INR",
        response: responseText,
      };
    } catch (error) {
      throw new Error(`Failed to fetch SMSIndia Hub balance: ${error.message}`);
    }
  }
}

// Create singleton instance
const smsIndiaHubService = new SMSIndiaHubService();

export default smsIndiaHubService;
