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

class ProfilController extends AbstractController
{
    // Champs que l'agent peut modifier lui-même
    private const SELF_EDITABLE = ['NiGend', 'Nom', 'Prenom', 'Mail', 'user_id', 'Statut', 'Subdivision', 'Grade'];
    private const LIMITS        = ['NiGend' => 50, 'Nom' => 100, 'Prenom' => 100, 'Mail' => 200, 'user_id' => 200, 'Statut' => 100, 'Subdivision' => 200, 'Grade' => 100];

    public function __construct(
        private readonly Connection    $db,
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
    ) {
    }

    #[Route('/mon-profil', name: 'app_mon_profil', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();

        // Les gestionnaires+ ont leur propre vue complète
        if ($this->roles->canManage($user)) {
            return $this->redirectToRoute('app_personnel');
        }

        return $this->render('profil/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }

    // GET /api/mon-profil — fiche complète de l'agent connecté
    #[Route('/api/mon-profil', name: 'api_mon_profil_get', methods: ['GET'])]
    public function get(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        $row  = $this->loadRow($user);

        if (!$row) {
            return $this->json(['error' => 'Fiche introuvable'], 404);
        }

        return $this->json($this->format($row));
    }

    // PATCH /api/mon-profil — mise à jour des champs autorisés
    #[Route('/api/mon-profil', name: 'api_mon_profil_patch', methods: ['PATCH'])]
    public function patch(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        $row  = $this->loadRow($user);

        if (!$row) {
            return $this->json(['error' => 'Fiche introuvable'], 404);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $sets   = [];
        $vals   = ['id' => (int) $row['id']];
        $i      = 0;

        foreach (self::SELF_EDITABLE as $field) {
            if (!array_key_exists($field, $data)) {
                continue;
            }
            $val = $data[$field];
            $limit = self::LIMITS[$field] ?? 200;
            if (is_string($val) && strlen($val) > $limit) {
                return $this->json(['error' => "Le champ « $field » dépasse $limit caractères"], 400);
            }
            $sets[]      = "\"$field\" = :p$i";
            $vals["p$i"] = $val === '' ? null : $val;
            $i++;
        }

        if (empty($sets)) {
            return $this->json(['error' => 'Aucun champ modifiable fourni'], 400);
        }

        $this->db->executeStatement(
            'UPDATE personnel SET ' . implode(', ', $sets) . ' WHERE id = :id',
            $vals
        );

        $updated = $this->db->fetchAssociative('SELECT * FROM personnel WHERE id = :id', ['id' => (int) $row['id']]);
        return $this->json($this->format($updated));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function loadRow(AppUser $user): array|false
    {
        if ($user->getPersonnelId()) {
            return $this->db->fetchAssociative(
                'SELECT * FROM personnel WHERE id = :id',
                ['id' => $user->getPersonnelId()]
            );
        }
        return $this->db->fetchAssociative(
            'SELECT * FROM personnel WHERE LOWER("Mail") = LOWER(:mail)',
            ['mail' => $user->getUserIdentifier()]
        );
    }

    private function format(array $row): array
    {
        // Unités rattachées
        $unites = $this->db->fetchAllAssociative(
            'SELECT u.id, u."Nom", u.code, pu.type
             FROM unites u
             JOIN personnel_unite pu ON pu.unite_id = u.id
             WHERE pu.personnel_id = :id
             ORDER BY u."Nom"',
            ['id' => (int) $row['id']]
        );

        // Salons via unités
        $salonIds = [];
        foreach ($unites as $unite) {
            $sRow = $this->db->fetchAssociative('SELECT "Salons" FROM unites WHERE id = :id', ['id' => $unite['id']]);
            if ($sRow && !empty($sRow['Salons'])) {
                $arr = is_string($sRow['Salons'])
                    ? ($sRow['Salons'] === '{}' ? [] : array_map('intval', explode(',', trim($sRow['Salons'], '{}'))))
                    : (array) $sRow['Salons'];
                $salonIds = array_merge($salonIds, $arr);
            }
        }
        $salonIds = array_unique($salonIds);

        $salons = [];
        if (!empty($salonIds)) {
            $ph = implode(',', array_fill(0, count($salonIds), '?'));
            $salons = $this->db->fetchAllAssociative(
                "SELECT id, \"Nom\", \"Type\", \"Description\" FROM salons WHERE id IN ($ph) ORDER BY \"Nom\"",
                $salonIds
            );
        }

        return array_merge($row, [
            '_unites' => $unites,
            '_salons' => $salons,
        ]);
    }
}
