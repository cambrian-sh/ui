import { invoke } from '@tauri-apps/api/core';
import type * as h from './types-hierarchy';

/**
 * ADR-0142 stage 2: the org-directory plane (src-tauri/src/org.rs), gated on
 * the `org-directory` capability. Reads are open to Operator and Viewer
 * (GetMyOrgChain to everyone); every mutation is Operator-only and carries a
 * mandatory `reason` — the Rust core adds the command_id. A SCIM bearer
 * arrives ONLY in the create/rotate answer.
 */
export const hierarchyClient = {
  listOrgUnits: (): Promise<h.OrgUnit[]> => invoke<h.OrgUnit[]>('op_org_list_units'),
  listOrgPeople: (unitId = '', query = '', includeInactive = false): Promise<h.OrgPerson[]> =>
    invoke<h.OrgPerson[]>('op_org_list_people', { unit_id: unitId, query, include_inactive: includeInactive }),
  listDirectoryGroups: (): Promise<h.DirectoryGroup[]> => invoke<h.DirectoryGroup[]>('op_org_list_directory_groups'),
  /** `principalId` '' = the caller's own chain (any role). */
  getOrgChain: (principalId: string): Promise<h.OrgChain> =>
    invoke<h.OrgChain>('op_org_get_chain', { principal_id: principalId }),
  listMappingRules: (): Promise<h.MappingRule[]> => invoke<h.MappingRule[]>('op_org_list_mapping_rules'),
  /** The dry run: writes nothing. */
  previewMappingRules: (upsert: h.MappingRule | null, deleteId = ''): Promise<h.MappingReport> =>
    invoke<h.MappingReport>('op_org_preview_mapping_rules', { upsert, delete_id: deleteId }),
  getApprovalSettings: (): Promise<h.ApprovalSettings> => invoke<h.ApprovalSettings>('op_org_get_approval_settings'),
  listScimConnections: (): Promise<h.ScimConnection[]> => invoke<h.ScimConnection[]>('op_org_list_scim_connections'),
  getReconcileStatus: (): Promise<h.ReconcileStatus> => invoke<h.ReconcileStatus>('op_org_get_reconcile_status'),

  saveOrgUnit: (unit: h.OrgUnit, reason: string): Promise<h.OrgUnit> =>
    invoke<h.OrgUnit>('op_org_save_unit', { unit, reason }),
  deleteOrgUnit: (id: string, reason: string): Promise<h.OrgAck> => invoke<h.OrgAck>('op_org_delete_unit', { id, reason }),
  saveOrgPerson: (person: h.OrgPerson, reason: string): Promise<h.OrgPerson> =>
    invoke<h.OrgPerson>('op_org_save_person', { person, reason }),
  setOrgPersonActive: (principalId: string, active: boolean, reason: string): Promise<h.OrgPerson> =>
    invoke<h.OrgPerson>('op_org_set_person_active', { principal_id: principalId, active, reason }),
  /** Stores AND applies the rule set. Offer it only after a preview of exactly this rule. */
  saveMappingRule: (rule: h.MappingRule, reason: string): Promise<h.SaveMappingRuleResponse> =>
    invoke<h.SaveMappingRuleResponse>('op_org_save_mapping_rule', { rule, reason }),
  deleteMappingRule: (id: string, reason: string): Promise<h.MappingReport> =>
    invoke<h.MappingReport>('op_org_delete_mapping_rule', { id, reason }),
  applyMappingRules: (reason: string): Promise<h.MappingReport> =>
    invoke<h.MappingReport>('op_org_apply_mapping_rules', { reason }),
  createScimConnection: (name: string, oidcIssuer: string, reason: string): Promise<h.ScimConnectionSecret> =>
    invoke<h.ScimConnectionSecret>('op_org_create_scim_connection', { name, oidc_issuer: oidcIssuer, reason }),
  rotateScimToken: (id: string, reason: string): Promise<h.ScimConnectionSecret> =>
    invoke<h.ScimConnectionSecret>('op_org_rotate_scim_token', { id, reason }),
  revokeScimConnection: (id: string, reason: string): Promise<h.ScimConnection> =>
    invoke<h.ScimConnection>('op_org_revoke_scim_connection', { id, reason }),
  runReconcileNow: (reason: string): Promise<h.ReconcileStatus> =>
    invoke<h.ReconcileStatus>('op_org_run_reconcile_now', { reason }),
};
