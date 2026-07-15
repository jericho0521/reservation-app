import {
  createReservation,
  prepareLegacyReservationCreate,
  type ReservationCreateRepositoryPort,
} from "./reservations.js";
import { listAvailability, type AvailabilityRepositoryPort } from "./availability.js";
import { listPlatformServices, type PlatformCatalogRepository } from "./catalog.js";
import { listExperienceKnowledge, type ExperienceKnowledgeRepository } from "./experience-knowledge.js";
import type { ExperienceStudioRepository } from "./experience-studio.js";
import type { ConversationOrchestratorDependencies } from "./conversation-orchestrator.js";

export function createConversationBookingTools(input: {
  catalogRepository: PlatformCatalogRepository;
  availabilityRepository: AvailabilityRepositoryPort;
  reservationCreateRepository: ReservationCreateRepositoryPort;
}): ConversationOrchestratorDependencies["tools"] {
  return {
    async getService(scope, serviceId) {
      const result = await listPlatformServices(input.catalogRepository, { venueId: scope.venueId });
      return "services" in result.body
        ? result.body.services.find((service) => service.service_id === serviceId)
        : undefined;
    },
    async checkAvailability(scope, { serviceId, date }) {
      const services = await listPlatformServices(input.catalogRepository, { venueId: scope.venueId });
      if (!("services" in services.body) || !services.body.services.some((service) => service.service_id === serviceId)) {
        throw new Error("Service is outside the published experience.");
      }
      const result = await listAvailability({
        repository: input.availabilityRepository,
        query: new URLSearchParams({ service_id: serviceId, date }),
        venueId: scope.venueId,
      });
      if (!("slots" in result.body)) throw new Error(result.body.error.message);
      return result.body;
    },
    async createReservation(scope, reservation) {
      const legacy = prepareLegacyReservationCreate(reservation);
      const result = await createReservation({
        repository: input.reservationCreateRepository,
        legacyInput: legacy.legacyInput,
        venueId: scope.venueId,
      });
      if (!("reservation_id" in result.body)) throw new Error(result.body.error.message);
      return result.body;
    },
  };
}

export function createConversationProcessingDependencies(input: {
  conversations: ConversationOrchestratorDependencies["conversations"];
  state: ConversationOrchestratorDependencies["state"];
  catalogRepository: PlatformCatalogRepository;
  availabilityRepository: AvailabilityRepositoryPort;
  reservationCreateRepository: ReservationCreateRepositoryPort;
  experienceStudioRepository: ExperienceStudioRepository;
  experienceKnowledgeRepository: ExperienceKnowledgeRepository;
}): Omit<ConversationOrchestratorDependencies, "responder"> {
  return {
    conversations: input.conversations,
    state: input.state,
    async loadExperience(scope) {
      const [workspace, knowledgeResult, servicesResult] = await Promise.all([
        input.experienceStudioRepository.readWorkspace(scope),
        listExperienceKnowledge({ scope, repository: input.experienceKnowledgeRepository }),
        listPlatformServices(input.catalogRepository, { venueId: scope.venueId }),
      ]);
      if (!workspace || !("entries" in knowledgeResult.body) || !("services" in servicesResult.body)) {
        throw new Error("Experience context unavailable.");
      }
      return {
        businessName: workspace.profile.name,
        knowledge: knowledgeResult.body.entries.map((entry) => ({ question: entry.question, answer: entry.answer })),
        services: servicesResult.body.services.map((service) => ({ serviceId: service.service_id, name: service.name })),
      };
    },
    tools: createConversationBookingTools(input),
  };
}
