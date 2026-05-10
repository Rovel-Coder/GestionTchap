<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\ConfigService;
use App\Service\RoleService;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class PersonnelController extends AbstractController
{
    private const WRITABLE = [
        'NiGend', 'Nom', 'Prenom', 'Grade', 'Mail', 'user_id',
        'grist_user_id', 'Role', 'Statut', 'Subdivision', 'Unite', 'Salons_Extra',
    ];

    private const LIMITS = [
        'Nom'         => 100,
        'Prenom'      => 100,
        'Grade'       => 100,
        'Mail'        => 200,
        'user_id'     => 200,
        'Statut'      => 50,
        'Subdivision' => 50,
    ];

    public function __construct(
        private readonly Connection     $db,
        private readonly RoleService    $roles,
        private readonly ConfigService  $config,
    ) {
    }

    // ── Page HTML ──────────────────────────────────────────────────────────
    #[Route('/', name: 'app_home')]
    public function home(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();

        if ($this->roles->canManage($user)) {
            return $this->redirectToRoute('app_personnel');
        }

        if ($this->roles->canCrise($user)) {
            return $this->redirectToRoute('app_crise');
        }

        $uiConfig = $this->config->getUiConfig();
        $baseRole = $this->roles->extractBaseRole($user->getAppRole());
        $hasCarto = $user->isSysAdmin()
            || ($uiConfig['roleFeatures'][$baseRole]['carto'] ?? false);

        if ($hasCarto) {
            return $this->redirectToRoute('app_carto');
        }

        throw $this->createAccessDeniedException('Aucune vue n’est accessible pour ce compte.');
    }

    #[Route('/personnel', name: 'app_personnel', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            throw $this->createAccessDeniedException('Accès réservé aux gestionnaires');
        }

        return $this->render('personnel/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }

    // ── API JSON ───────────────────────────────────────────────────────────
    #[Route('/api/personnel', name: 'api_personnel_list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $rows = $this->db->fetchAllAssociative(
            'SELECT * FROM personnel ORDER BY "Nom", "Prenom"'
        );

        return $this->json(array_map($this->formatRow(...), $rows));
    }

    #[Route('/api/personnel', name: 'api_personnel_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $fields = $this->extractWritableFields($data);

        $err = $this->validateFields($fields);
        if ($err) {
            return $this->json(['error' => $err], 400);
        }

        [$cols, $vals, $phs] = $this->buildInsert($fields);

        $this->db->executeStatement(
            "INSERT INTO personnel ($cols) VALUES ($phs)",
            $vals
        );
        $id  = $this->db->lastInsertId();
        $row = $this->db->fetchAssociative('SELECT * FROM personnel WHERE id = :id', ['id' => $id]);

        return $this->json($this->formatRow($row), 201);
    }

    #[Route('/api/personnel/{id}', name: 'api_personnel_update', methods: ['PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $fields = $this->extractWritableFields($data);

        if (isset($fields['Role']) && !$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Seul un administrateur peut modifier le rôle'], 403);
        }

        if (empty($fields)) {
            return $this->json(['error' => 'Aucun champ à mettre à jour'], 400);
        }

        $err = $this->validateFields($fields);
        if ($err) {
            return $this->json(['error' => $err], 400);
        }

        [$sets, $vals] = $this->buildUpdate($fields, $id);

        $count = $this->db->executeStatement(
            "UPDATE personnel SET $sets WHERE id = :__id",
            $vals
        );

        if (!$count) {
            return $this->json(['error' => 'Agent introuvable'], 404);
        }

        $row = $this->db->fetchAssociative('SELECT * FROM personnel WHERE id = :id', ['id' => $id]);

        return $this->json($this->formatRow($row));
    }

    #[Route('/api/personnel/{id}', name: 'api_personnel_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $count = $this->db->executeStatement(
            'DELETE FROM personnel WHERE id = :id',
            ['id' => $id]
        );

        if (!$count) {
            return $this->json(['error' => 'Agent introuvable'], 404);
        }

        return new JsonResponse(null, 204);
    }

    // DELETE /api/personnel — suppression en masse (ids dans le body)
    #[Route('/api/personnel', name: 'api_personnel_bulk_delete', methods: ['DELETE'])]
    public function bulkDelete(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $ids  = array_values(array_filter(array_map('intval', $data['ids'] ?? []), fn($id) => $id > 0));

        if (empty($ids)) {
            return $this->json(['error' => 'Aucun id fourni'], 400);
        }

        $placeholders = implode(',', array_map(fn($i) => ":id$i", array_keys($ids)));
        $params       = [];
        foreach ($ids as $i => $id) {
            $params["id$i"] = $id;
        }

        $deleted = $this->db->executeStatement(
            "DELETE FROM personnel WHERE id IN ($placeholders)",
            $params
        );

        return $this->json(['deleted' => $deleted]);
    }

    // ── Normalisation user_id ──────────────────────────────────────────────
    #[Route('/api/personnel/normalize-user-ids', name: 'api_personnel_normalize_user_ids', methods: ['POST'])]
    public function normalizeUserIds(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $agents  = $this->db->fetchAllAssociative('SELECT id, "user_id" FROM personnel WHERE "user_id" IS NOT NULL AND "user_id" != \'\'');
        $fixed   = 0;
        $skipped = 0;

        foreach ($agents as $agent) {
            $normalized = $this->normalizeMatrixId($agent['user_id']);
            if ($normalized !== $agent['user_id']) {
                $this->db->executeStatement(
                    'UPDATE personnel SET "user_id" = :uid WHERE id = :id',
                    ['uid' => $normalized, 'id' => $agent['id']]
                );
                $fixed++;
            } else {
                $skipped++;
            }
        }

        return $this->json(['ok' => true, 'fixed' => $fixed, 'skipped' => $skipped]);
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    private function extractWritableFields(array $data): array
    {
        $fields = [];
        foreach (self::WRITABLE as $key) {
            if (!array_key_exists($key, $data)) {
                continue;
            }
            if ($key === 'Unite' || $key === 'Salons_Extra') {
                $fields[$key] = $this->toIntArray($data[$key]);
            } elseif ($key === 'user_id') {
                $fields[$key] = $this->normalizeMatrixId($data[$key]);
            } else {
                $fields[$key] = $data[$key];
            }
        }
        return $fields;
    }

    /**
     * Normalise une valeur user_id vers un Matrix ID valide.
     * Si la valeur ressemble à une adresse email Tchap, la convertit automatiquement.
     * Exemples :
     *   "prenom.nom@gendarmerie.interieur.gouv.fr"
     *     → "@prenom.nom-gendarmerie.interieur.gouv.fr:agent.interieur.tchap.gouv.fr"
     *   "@prenom.nom:agent.interieur.tchap.gouv.fr" → inchangé
     */
    private function normalizeMatrixId(?string $val): string
    {
        $val = trim((string) $val);
        if ($val === '') {
            return '';
        }
        // Déjà un Matrix ID valide (@localpart:homeserver, sans @ dans le localpart)
        if (preg_match('/^@[^@:]+:[^@:]+/', $val)) {
            return $val;
        }
        // Ressemble à une adresse email → conversion Tchap
        // On utilise le DERNIER @ comme séparateur local/domaine pour éviter les doubles @
        if (str_contains($val, '@') && !str_starts_with($val, '@')) {
            $at     = strrpos($val, '@'); // dernier @ (sécurité pour les emails malformés)
            $local  = substr($val, 0, $at);
            $domain = substr($val, $at + 1);
            // Remplacer les @ résiduels dans local (ne devrait pas arriver, sécurité)
            $local  = str_replace('@', '-', $local);
            return "@{$local}-{$domain}:agent.interieur.tchap.gouv.fr";
        }
        // Autre valeur : retourner telle quelle (sera rejeté par la validation si invalide)
        return $val;
    }

    private function toIntArray(mixed $val): array
    {
        if (!$val) {
            return [];
        }
        if (is_array($val)) {
            $start = ($val[0] ?? null) === 'L' ? 1 : 0;
            return array_values(array_filter(
                array_map('intval', array_slice($val, $start)),
                fn($n) => $n !== 0
            ));
        }
        return [];
    }

    private function validateFields(array $fields): ?string
    {
        if (isset($fields['NiGend'])) {
    $n = trim((string) $fields['NiGend']);

    // Autoriser vide
    if ($n !== '') {

        // Vérification uniquement si renseigné
        if (!preg_match('/^\d{6}$/', $n) || (int)$n < 100000 || (int)$n > 999999) {
            return 'Le NiGend doit être un nombre à 6 chiffres (100000–999999)';
        }
    }
}
        foreach (self::LIMITS as $key => $limit) {
            if (isset($fields[$key]) && is_string($fields[$key]) && strlen($fields[$key]) > $limit) {
                return sprintf('Le champ "%s" dépasse la limite de %d caractères', $key, $limit);
            }
        }
        return null;
    }

    private function buildInsert(array $fields): array
    {
        $cols = [];
        $vals = [];
        $phs  = [];
        $i    = 0;

        foreach ($fields as $key => $value) {
            if ($key === 'Unite' || $key === 'Salons_Extra') {
                $cols[]    = "\"$key\"";
                $phs[]     = ':p' . $i;
                $vals['p' . $i] = $this->arrayToPg($value);
            } else {
                $cols[]    = "\"$key\"";
                $phs[]     = ':p' . $i;
                $vals['p' . $i] = $value;
            }
            $i++;
        }

        return [implode(', ', $cols), $vals, implode(', ', $phs)];
    }

    private function buildUpdate(array $fields, int $id): array
    {
        $sets = [];
        $vals = ['__id' => $id];
        $i    = 0;

        foreach ($fields as $key => $value) {
            if ($key === 'Unite' || $key === 'Salons_Extra') {
                $sets[]         = "\"$key\" = :p$i";
                $vals['p' . $i] = $this->arrayToPg($value);
            } else {
                $sets[]         = "\"$key\" = :p$i";
                $vals['p' . $i] = $value;
            }
            $i++;
        }

        return [implode(', ', $sets), $vals];
    }

    private function arrayToPg(array $arr): string
    {
        if (empty($arr)) {
            return '{}';
        }
        return '{' . implode(',', array_map('intval', $arr)) . '}';
    }

    private function formatRow(array $row): array
    {
        $row['Unite']       = $this->pgArrayToPhp($row['Unite'] ?? '{}');
        $row['Salons_Extra'] = $this->pgArrayToPhp($row['Salons_Extra'] ?? '{}');
        unset($row['password_hash']);
        return $row;
    }

    private function pgArrayToPhp(mixed $val): array
    {
        if (is_array($val)) {
            return array_map('intval', $val);
        }
        $s = (string) $val;
        if ($s === '{}' || $s === '') {
            return [];
        }
        return array_map('intval', explode(',', trim($s, '{}')));
    }
}
