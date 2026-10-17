import { Group, Table } from "@mantine/core";
import { Bone } from "@repo/ui/skeleton";

/** A few holder rows (avatar, name, email), laid out like the table of holders. */
export function HoldersSkeleton() {
  return (
    <Table>
      <Table.Tbody>
        {[0, 1, 2].map((row) => (
          <Table.Tr key={row}>
            <Table.Td>
              <Group gap="sm">
                <Bone h={26} w={26} circle />
                <div>
                  <Bone h={14} w={120} my={3} />
                  <Bone h={12} w={180} my={2} />
                </div>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
