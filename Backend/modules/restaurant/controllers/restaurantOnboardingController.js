import Restaurant from "../models/Restaurant.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { createRestaurantFromOnboarding } from "./restaurantController.js";

// Get current restaurant's onboarding data
export const getOnboarding = async (req, res) => {
  try {
    // Check if restaurant is authenticated
    if (!req.restaurant || !req.restaurant._id) {
      return errorResponse(res, 401, "Restaurant not authenticated");
    }

    const restaurantId = req.restaurant._id;
    const restaurant = await Restaurant.findById(restaurantId)
      .select("onboarding")
      .lean();

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    return successResponse(res, 200, "Onboarding data retrieved", {
      onboarding: restaurant.onboarding || null,
    });
  } catch (error) {
    console.error("Error fetching restaurant onboarding:", error);
    return errorResponse(res, 500, "Failed to fetch onboarding data");
  }
};

// Upsert onboarding data (all steps in one payload)
export const upsertOnboarding = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { step1, step2, step3, step4, completedSteps } = req.body;

    // Get existing restaurant data to merge if needed
    const existingRestaurant = await Restaurant.findById(restaurantId).lean();
    const existingOnboarding = existingRestaurant?.onboarding || {};

    const update = {};

    // Step1: Always update if provided
    if (step1) {
      update["onboarding.step1"] = step1;
    }

    // Step2: Update if provided (even if empty arrays, as user might be clearing data)
    if (step2 !== undefined && step2 !== null) {
      update["onboarding.step2"] = step2;
    }

    // Step3: Update if provided (replace completely, as frontend sends full step3 object)
    if (step3 !== undefined && step3 !== null) {
      update["onboarding.step3"] = step3;
    }

    // Step4: Always update if provided
    if (step4 !== undefined && step4 !== null) {
      update["onboarding.step4"] = step4;
    }

    // Update completedSteps if provided (always update, even if 0)
    if (
      typeof completedSteps === "number" &&
      completedSteps !== null &&
      completedSteps !== undefined
    ) {
      update["onboarding.completedSteps"] = completedSteps;
    }
    const restaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $set: update },
      {
        new: true,
        upsert: false,
      },
    );

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const onboarding = restaurant.onboarding;

    // Log saved data for verification
    // If onboarding is complete (step 4), update restaurant with final data
    // Also update restaurant schema when step2 is completed (for immediate data availability)
    // Check both the request body and the saved document's completedSteps
    const finalCompletedSteps = onboarding.completedSteps || completedSteps;

    // Update restaurant schema when step1 is completed (basic info)
    if (finalCompletedSteps >= 1 && step1) {
      try {
        const updateData = {};
        if (step1.restaurantName) {
          updateData.name = step1.restaurantName;
        }
        if (step1.ownerName) {
          updateData.ownerName = step1.ownerName;
        }
        if (step1.ownerEmail) {
          updateData.ownerEmail = step1.ownerEmail;
        }
        if (step1.ownerPhone) {
          updateData.ownerPhone = step1.ownerPhone;
        }
        if (step1.primaryContactNumber) {
          updateData.primaryContactNumber = step1.primaryContactNumber;
        }
        if (step1.location) {
          updateData.location = step1.location;
        }

        if (Object.keys(updateData).length > 0) {
          await Restaurant.findByIdAndUpdate(restaurantId, {
            $set: updateData,
          });
        }
      } catch (step1UpdateError) {
        console.error(
          "⚠️ Error updating restaurant schema with step1 data:",
          step1UpdateError,
        );
        // Don't fail the request, just log the error
      }
    }

    // Update restaurant schema when step2 is completed (cuisines, openDays, menuImages, etc.)
    if (finalCompletedSteps >= 2 && step2) {
      try {
        const updateData = {};
        if (step2.profileImageUrl) {
          updateData.profileImage = step2.profileImageUrl;
        }
        if (step2.menuImageUrls !== undefined) {
          updateData.menuImages = step2.menuImageUrls; // Update even if empty array
        }
        if (step2.cuisines !== undefined) {
          updateData.cuisines = step2.cuisines; // Update even if empty array
        }
        if (step2.deliveryTimings) {
          updateData.deliveryTimings = step2.deliveryTimings;
        }
        if (step2.openDays !== undefined) {
          updateData.openDays = step2.openDays; // Update even if empty array
        }

        if (Object.keys(updateData).length > 0) {
          const updated = await Restaurant.findByIdAndUpdate(
            restaurantId,
            { $set: updateData },
            { new: true },
          );
        } else {
          console.warn("⚠️ No step2 data to update in restaurant schema");
        }
      } catch (step2UpdateError) {
        console.error(
          "⚠️ Error updating restaurant schema with step2 data:",
          step2UpdateError,
        );
        console.error("Error details:", {
          message: step2UpdateError.message,
          stack: step2UpdateError.stack,
        });
        // Don't fail the request, just log the error
      }
    }

    // Update restaurant schema when step3 is completed (PAN, GST, FSSAI, bank details)
    // Step3 data is stored in onboarding subdocument, no need to duplicate in main schema
    // as it's documentation/verification data, not display data
    if (finalCompletedSteps >= 3 && step3) {
    }

    // Update restaurant schema when step4 is completed (display data)
    if (finalCompletedSteps >= 4 && step4) {
      try {
        const updateData = {};
        if (step4.estimatedDeliveryTime !== undefined) {
          updateData.estimatedDeliveryTime = step4.estimatedDeliveryTime;
        }
        if (step4.distance !== undefined) {
          updateData.distance = step4.distance;
        }
        if (step4.priceRange !== undefined) {
          updateData.priceRange = step4.priceRange;
        }
        if (step4.featuredDish !== undefined) {
          updateData.featuredDish = step4.featuredDish;
        }
        if (step4.featuredPrice !== undefined) {
          updateData.featuredPrice = step4.featuredPrice;
        }
        if (step4.offer !== undefined) {
          updateData.offer = step4.offer;
        }

        if (Object.keys(updateData).length > 0) {
          const updated = await Restaurant.findByIdAndUpdate(
            restaurantId,
            { $set: updateData },
            { new: true },
          );
        } else {
          console.warn("⚠️ No step4 data to update in restaurant schema");
        }
      } catch (step4UpdateError) {
        console.error(
          "⚠️ Error updating restaurant schema with step4 data:",
          step4UpdateError,
        );
        // Don't fail the request, just log the error
      }
    }
    // Update restaurant with final data if onboarding is complete (step 4)
    // Also check if step4 is being sent (which means user is completing step 4)
    // Note: Individual step updates are handled above, this is for final consolidation
    if (finalCompletedSteps === 4 || (step4 && completedSteps === 4)) {
      // All individual steps have already updated the restaurant schema above
      // This section is kept for backward compatibility and final validation

      // Fetch the complete restaurant to verify all data is saved
      const completeRestaurant = await Restaurant.findById(restaurantId).lean();
      // Send email notifications
      try {
        const emailService = (
          await import("../../auth/services/emailService.js")
        ).default;

        // 1. Send welcome email to Restaurant Owner
        if (
          completeRestaurant.ownerEmail &&
          !completeRestaurant.ownerEmail.includes("@restaurant.appzeto.com")
        ) {
          emailService
            .sendRestaurantWelcome(
              completeRestaurant.ownerEmail,
              completeRestaurant.ownerName,
              completeRestaurant.name,
            )
            .catch((err) =>
              console.error(`Failed to send welcome email: ${err.message}`),
            );
        }

        // 2. Send Alert to Admin
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
        if (adminEmail) {
          emailService
            .sendRestaurantRegistrationAlert(adminEmail, {
              name: completeRestaurant.name,
              ownerName: completeRestaurant.ownerName,
              ownerPhone: completeRestaurant.ownerPhone,
              phone: completeRestaurant.phone,
              address: completeRestaurant.onboarding?.step1?.location || {
                city: "Unknown",
              },
            })
            .catch((err) =>
              console.error(`Failed to send admin alert: ${err.message}`),
            );
        }
      } catch (emailError) {
        console.error("Error sending onboarding emails:", emailError);
      }

      // Return success response with restaurant info
      return successResponse(
        res,
        200,
        "Onboarding data saved and restaurant updated",
        {
          onboarding,
          restaurant: {
            restaurantId: completeRestaurant?.restaurantId,
            _id: completeRestaurant?._id,
            name: completeRestaurant?.name,
            slug: completeRestaurant?.slug,
            isActive: completeRestaurant?.isActive,
          },
        },
      );
    }

    return successResponse(res, 200, "Onboarding data saved", {
      onboarding,
    });
  } catch (error) {
    console.error("Error saving restaurant onboarding:", error);
    return errorResponse(res, 500, "Failed to save onboarding data");
  }
};

// Manual trigger to update restaurant from onboarding (for debugging/fixing)
export const createRestaurantFromOnboardingManual = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;

    // Fetch the complete restaurant with onboarding data
    const restaurant = await Restaurant.findById(restaurantId).lean();

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    if (!restaurant.onboarding) {
      return errorResponse(res, 404, "Onboarding data not found");
    }

    if (!restaurant.onboarding.step1 || !restaurant.onboarding.step2) {
      return errorResponse(
        res,
        400,
        "Incomplete onboarding data. Please complete all steps first.",
      );
    }

    if (restaurant.onboarding.completedSteps !== 3) {
      return errorResponse(
        res,
        400,
        `Onboarding not complete. Current step: ${restaurant.onboarding.completedSteps}/3`,
      );
    }

    try {
      const updatedRestaurant = await createRestaurantFromOnboarding(
        restaurant.onboarding,
        restaurantId,
      );

      return successResponse(res, 200, "Restaurant updated successfully", {
        restaurant: {
          restaurantId: updatedRestaurant.restaurantId,
          _id: updatedRestaurant._id,
          name: updatedRestaurant.name,
          slug: updatedRestaurant.slug,
          isActive: updatedRestaurant.isActive,
        },
      });
    } catch (error) {
      console.error("Error updating restaurant:", error);
      return errorResponse(
        res,
        500,
        `Failed to update restaurant: ${error.message}`,
      );
    }
  } catch (error) {
    console.error("Error in createRestaurantFromOnboardingManual:", error);
    return errorResponse(res, 500, "Failed to process request");
  }
};
