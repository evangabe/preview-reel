import { z } from "zod";

export const demoSpecSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    featureSlug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be kebab-case"),
    entryPoint: z
      .string()
      .startsWith("/")
      .refine((path) => !path.startsWith("//"), "must be a same-origin path")
      .nullable(),
    intent: z.string().trim().min(1).max(300),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const descriptionFields = {
  label: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(240).optional(),
};

const delayedFields = {
  ...descriptionFields,
  delay: z.number().int().min(0).max(10_000).optional(),
};

const stableSelector = z
  .string()
  .min(1)
  .max(300)
  .refine((selector) => !/^@e\d+$/.test(selector), {
    message: "agent-browser refs cannot be replayed by WebReel",
  });

const targetFields = {
  text: z.string().min(1).max(200).optional(),
  selector: stableSelector.optional(),
  within: stableSelector.optional(),
};

function oneTarget(value: { text?: string; selector?: string }) {
  return Number(value.text !== undefined) + Number(value.selector !== undefined) === 1;
}

const elementTargetSchema = z
  .object(targetFields)
  .strict()
  .refine(oneTarget, "provide exactly one of text or selector");

const pauseStepSchema = z
  .object({
    action: z.literal("pause"),
    ms: z.number().int().min(0).max(15_000),
    ...descriptionFields,
  })
  .strict();

const clickStepSchema = z
  .object({
    action: z.literal("click"),
    ...targetFields,
    modifiers: z.array(z.string().min(1)).max(4).optional(),
    ...delayedFields,
  })
  .strict()
  .refine(oneTarget, "provide exactly one of text or selector");

const keyStepSchema = z
  .object({
    action: z.literal("key"),
    key: z.string().min(1).max(80),
    target: z.union([stableSelector, elementTargetSchema]).optional(),
    ...delayedFields,
  })
  .strict();

const dragStepSchema = z
  .object({
    action: z.literal("drag"),
    from: elementTargetSchema,
    to: elementTargetSchema,
    ...delayedFields,
  })
  .strict();

const typeStepSchema = z
  .object({
    action: z.literal("type"),
    text: z.string().max(500),
    selector: stableSelector,
    within: stableSelector.optional(),
    charDelay: z.number().int().min(0).max(1_000).optional(),
    ...delayedFields,
  })
  .strict();

const scrollStepSchema = z
  .object({
    action: z.literal("scroll"),
    x: z.number().int().min(-10_000).max(10_000).optional(),
    y: z.number().int().min(-10_000).max(10_000).optional(),
    ...targetFields,
    ...delayedFields,
  })
  .strict()
  .refine(
    (step) =>
      step.x !== undefined ||
      step.y !== undefined ||
      step.text !== undefined ||
      step.selector !== undefined,
    "scroll needs an offset or a target",
  );

const waitStepSchema = z
  .object({
    action: z.literal("wait"),
    ...targetFields,
    timeout: z.number().int().min(1).max(15_000).optional(),
    ...delayedFields,
  })
  .strict()
  .refine(oneTarget, "provide exactly one of text or selector");

const moveToStepSchema = z
  .object({
    action: z.literal("moveTo"),
    ...targetFields,
    ...delayedFields,
  })
  .strict()
  .refine(oneTarget, "provide exactly one of text or selector");

const screenshotStepSchema = z
  .object({
    action: z.literal("screenshot"),
    output: z.string().min(1).max(200),
    ...delayedFields,
  })
  .strict();

const navigateStepSchema = z
  .object({
    action: z.literal("navigate"),
    url: z
      .string()
      .startsWith("/")
      .refine((path) => !path.startsWith("//"), "must be a same-origin path"),
    ...delayedFields,
  })
  .strict();

const hoverStepSchema = z
  .object({
    action: z.literal("hover"),
    ...targetFields,
    ...delayedFields,
  })
  .strict()
  .refine(oneTarget, "provide exactly one of text or selector");

const selectStepSchema = z
  .object({
    action: z.literal("select"),
    ...targetFields,
    value: z.string().max(300),
    ...delayedFields,
  })
  .strict()
  .refine(oneTarget, "provide exactly one of text or selector");

export const webreelStepSchema = z.union([
  pauseStepSchema,
  clickStepSchema,
  keyStepSchema,
  dragStepSchema,
  typeStepSchema,
  scrollStepSchema,
  waitStepSchema,
  moveToStepSchema,
  screenshotStepSchema,
  navigateStepSchema,
  hoverStepSchema,
  selectStepSchema,
]);

export const webreelStepsSchema = z.array(webreelStepSchema).min(1).max(12);

const viewportSchema = z
  .object({
    width: z.number().int().min(320).max(3_840),
    height: z.number().int().min(320).max(2_160),
  })
  .strict();

const videoSchema = z
  .object({
    url: z.string().min(1),
    baseUrl: z.string().url().optional(),
    viewport: viewportSchema.optional(),
    output: z.string().min(1).optional(),
    thumbnail: z
      .object({
        time: z.number().min(0).optional(),
        enabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
    defaultDelay: z.number().int().min(0).max(10_000).optional(),
    steps: webreelStepsSchema,
  })
  .strict();

export const webreelConfigSchema = z
  .object({
    $schema: z.literal("https://webreel.dev/schema/v1.json").optional(),
    baseUrl: z.string().url().optional(),
    videos: z.record(z.string().min(1), videoSchema),
  })
  .strict()
  .refine((config) => Object.keys(config.videos).length === 1, {
    message: "Preview Reel emits exactly one video per PR",
    path: ["videos"],
  });

export type DemoSpec = z.infer<typeof demoSpecSchema>;
export type WebreelStep = z.infer<typeof webreelStepSchema>;
export type WebreelConfig = z.infer<typeof webreelConfigSchema>;
