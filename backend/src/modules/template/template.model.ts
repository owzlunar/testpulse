import mongoose, { Schema } from 'mongoose'
import type { TestCaseTemplate } from '#contract/types.js'
import { stringId } from '#core/database/ids.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

export interface TemplateDoc extends Omit<TestCaseTemplate, 'id'> {
  _id: string
}

const templateSchema = new Schema<TemplateDoc>(
  {
    _id: stringId('tpl'),
    name: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 2000 },
    // the case a template fills in (name, scenario, steps …), stored as given
    draft: { type: Schema.Types.Mixed, required: true },
    builtIn: { type: Boolean },
    createdBy: { type: String },
    usageCount: { type: Number, default: 0 },
  },
  { collection: 'test_case_templates', versionKey: false },
)

templateSchema.plugin(toJSONPlugin)

export const TemplateModel = mongoose.model<TemplateDoc>('TestCaseTemplate', templateSchema)
