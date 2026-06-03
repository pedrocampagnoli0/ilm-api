// Payload shape from Eduzz nutror.module_completed webhook.
// Reference: https://developers.eduzz.com/reference/webhook/nutror-module-completed
// We don't use class-validator here because the body is HMAC-verified before
// reaching the controller; only a shape check is needed and is done in-service.

export interface NutrorActor {
  email: string;
  name?: string;
}

export interface NutrorCourseRef {
  hash: string;
  title: string;
}

export interface NutrorLessonRef {
  id: string;
  title?: string;
}

export interface NutrorModuleRef {
  id: string;
  title?: string;
}

export interface NutrorModuleCompletedData {
  producer?: NutrorActor;
  learner: NutrorActor;
  course: NutrorCourseRef;
  lesson?: NutrorLessonRef;
  module: NutrorModuleRef;
  createdAt: string;
}

export interface NutrorModuleCompletedPayload {
  id?: string;
  event: string;
  data: NutrorModuleCompletedData;
  sentDate?: string;
}
