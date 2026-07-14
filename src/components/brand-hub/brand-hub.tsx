import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BrainCircuit, Palette, FileText, TrendingUp } from "lucide-react";
import { getBrandHub } from "@/lib/brand-hub.functions";
import { BriefingTab } from "./briefing-tab";
import { VisualIdentityTab } from "./visual-identity-tab";
import { DocumentsTab } from "./documents-tab";
import { CompetitorsTab } from "./competitors-tab";

export function BrandHub({ brandId, clientId }: { brandId: string; clientId: string }) {
  const qc = useQueryClient();
  const fetchHub = useServerFn(getBrandHub);
  const hubQ = useQuery({
    queryKey: ["brand-hub", brandId, clientId],
    queryFn: () => fetchHub({ data: { brandId, clientId } }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["brand-hub", brandId, clientId] });

  if (hubQ.isLoading || !hubQ.data) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  return (
    <Tabs defaultValue="briefing" className="space-y-4">
      <TabsList variant="bordered">
        <TabsTrigger value="briefing">
          <BrainCircuit className="h-3.5 w-3.5" /> Persona & Briefing
        </TabsTrigger>
        <TabsTrigger value="visual">
          <Palette className="h-3.5 w-3.5" /> Visual Identity
        </TabsTrigger>
        <TabsTrigger value="competitors">
          <TrendingUp className="h-3.5 w-3.5" /> Competitors
        </TabsTrigger>
        <TabsTrigger value="docs">
          <FileText className="h-3.5 w-3.5" /> Knowledge Base
        </TabsTrigger>
      </TabsList>
      <TabsContent value="briefing">
        <BriefingTab
          brandId={brandId}
          clientId={clientId}
          data={hubQ.data.brand_hub}
          onSaved={invalidate}
        />
      </TabsContent>
      <TabsContent value="visual">
        <VisualIdentityTab
          brandId={brandId}
          clientId={clientId}
          client={hubQ.data}
          onSaved={invalidate}
        />
      </TabsContent>
      <TabsContent value="competitors">
        <CompetitorsTab
          brandId={brandId}
          clientId={clientId}
          competitors={hubQ.data.brand_hub.competitors ?? []}
        />
      </TabsContent>
      <TabsContent value="docs">
        <DocumentsTab brandId={brandId} clientId={clientId} />
      </TabsContent>
    </Tabs>
  );
}