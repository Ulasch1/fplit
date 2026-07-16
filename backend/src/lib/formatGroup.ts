export function formatGroup(group: {
  id: string;
  name: string;
  ownerId: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: group.id,
    name: group.name,
    owner_id: group.ownerId,
    status: group.status,
    created_at: group.createdAt,
  };
}
